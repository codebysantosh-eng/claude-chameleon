#!/usr/bin/env node
'use strict';

/*
 * forge-doctor.js — static coherence audit for the whole claude-chameleon kit.
 *
 * The kit is a web of cross-references: commands name agents, agents reference
 * profile skill sections and core rules, deep commands depend on the handoff
 * contract, and CLAUDE.md documents depths that must match the command files.
 * Nothing at runtime enforces that this web stays consistent — so an edit can
 * silently reintroduce a broken reference (a command pointing at a missing
 * agent, an agent told to use a tool it isn't granted, a `#section` that doesn't
 * exist, a depth that drifts from the docs).
 *
 * The doctor walks every link and fails CI on any contradiction. It is the gate
 * that keeps the kit at its quality bar over time.
 *
 * Usage:  node install/forge-doctor.js [--forge-root <dir>]
 * Exit:   0 if no ERROR findings; 1 otherwise. WARN never fails the build.
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./lib/yaml');

const ROOT = (() => {
  const i = process.argv.indexOf('--forge-root');
  return i > -1 ? path.resolve(process.argv[i + 1]) : path.resolve(__dirname, '..');
})();

const KNOWN_TOOLS = new Set(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'NotebookEdit']);
const VALID_MODELS = new Set(['opus', 'haiku']); // two-tier rule — see core/rules/model-strategy.md
const VALID_DEPTHS = new Set(['routine', 'deep', 'explore']);
const REQUIRED_COMMAND_KEYS = ['test', 'lint', 'format', 'build', 'audit', 'coverage', 'format-check', 'logs'];

const findings = [];
const err = (area, msg) => findings.push({ sev: 'ERROR', area, msg });
const warn = (area, msg) => findings.push({ sev: 'WARN', area, msg });

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
const listMd = (dir) => (exists(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')) : []);

// ── Collect agents (core/agents + top-level agents, minus the messages doc) ────
function collectAgents() {
  const agents = new Map();
  for (const dir of [path.join(ROOT, 'core', 'agents'), path.join(ROOT, 'agents')]) {
    for (const file of listMd(dir)) {
      if (file === 'stack-orchestrator-messages.md') continue;
      const full = path.join(dir, file);
      const body = read(full);
      const fm = parseFrontmatter(body);
      agents.set(fm.name || file.replace(/\.md$/, ''), { file: full, rel: path.relative(ROOT, full), fm, body });
    }
  }
  return agents;
}

// ── Agents: frontmatter, model tier, tool grants, tool/instruction coherence ───
function checkAgents(agents, ruleNames) {
  for (const [name, a] of agents) {
    const base = path.basename(a.file, '.md');
    if (a.fm.name !== base) err('agent', `${a.rel}: frontmatter name '${a.fm.name}' != filename '${base}'`);
    if (!a.fm.description) err('agent', `${a.rel}: missing 'description' (drives auto-delegation)`);
    if (!a.fm.model) err('agent', `${a.rel}: missing 'model'`);
    else if (!VALID_MODELS.has(a.fm.model)) err('agent', `${a.rel}: model '${a.fm.model}' violates two-tier rule (opus|haiku)`);

    const tools = String(a.fm.tools || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!tools.length) err('agent', `${a.rel}: no tools granted`);
    for (const t of tools) if (!KNOWN_TOOLS.has(t)) err('agent', `${a.rel}: unknown tool '${t}'`);

    // Coherence: a tool named as "**X tool**" in the body must be granted.
    const granted = new Set(tools);
    const mentioned = new Set();
    for (const m of a.body.matchAll(/\*\*([A-Z][a-zA-Z]+) tool\*\*/g)) {
      if (KNOWN_TOOLS.has(m[1])) mentioned.add(m[1]);
    }
    for (const t of mentioned) {
      if (!granted.has(t)) err('agent', `${a.rel}: body instructs the **${t} tool** but it is not in the tools grant (${tools.join(', ')})`);
    }

    checkRuleRefs(a.rel, a.body, ruleNames);
    void name;
  }
}

// ── Commands: frontmatter, valid depth, agent refs, orchestrator/depth coherence ─
function checkCommands(agents, ruleNames, depthTable) {
  const dir = path.join(ROOT, 'core', 'commands');
  for (const file of listMd(dir)) {
    const rel = path.relative(ROOT, path.join(dir, file));
    const body = read(path.join(dir, file));
    const fm = parseFrontmatter(body);
    const cmd = '/' + file.replace(/\.md$/, '');

    if (!fm.description) err('command', `${rel}: missing 'description'`);
    if (!fm.depth) err('command', `${rel}: missing 'depth'`);
    else if (!VALID_DEPTHS.has(fm.depth)) err('command', `${rel}: invalid depth '${fm.depth}'`);

    // Depth must match what CLAUDE.md documents.
    if (depthTable.size) {
      if (!depthTable.has(cmd)) err('docs', `CLAUDE.md Command Depth table is missing ${cmd}`);
      else if (depthTable.get(cmd) !== fm.depth) {
        err('docs', `${cmd}: depth '${fm.depth}' in file != '${depthTable.get(cmd)}' in CLAUDE.md table`);
      }
    }

    // Orchestrator usage must agree with depth.
    const usesOrchestrator = body.includes('stack-orchestrator');
    const refsHandoff = body.includes('FORGE_HANDOFF');
    if (fm.depth === 'deep') {
      if (!usesOrchestrator) err('command', `${rel}: deep command must invoke stack-orchestrator`);
      if (!refsHandoff) err('command', `${rel}: deep command must reference the <<<FORGE_HANDOFF>>> contract`);
    } else if (usesOrchestrator) {
      err('command', `${rel}: ${fm.depth} command invokes stack-orchestrator (only deep commands should)`);
    }

    // Every agent named as "`x` agent" must exist.
    for (const m of body.matchAll(/`([a-z][a-z0-9-]+)`\s+agent/g)) {
      if (!agents.has(m[1])) err('command', `${rel}: references agent \`${m[1]}\` which does not exist`);
    }

    checkRuleRefs(rel, body, ruleNames);
  }
}

// ── Profiles: required files, rules.md shape, commands.json, skill sections, a11y ─
function checkProfiles(ruleNames) {
  const pdir = path.join(ROOT, 'profiles');
  for (const name of fs.readdirSync(pdir)) {
    if (name === 'tests') continue;
    const dir = path.join(pdir, name);
    if (!fs.statSync(dir).isDirectory()) continue;

    for (const f of ['rules.md', 'context.md', 'commands.json', 'hooks.json', 'skills/SKILL.md']) {
      if (!exists(path.join(dir, f))) err('profile', `${name}: missing ${f}`);
    }

    const rulesPath = path.join(dir, 'rules.md');
    if (exists(rulesPath)) {
      const lines = read(rulesPath).replace(/\n$/, '').split('\n');
      if (lines.length > 4) err('profile', `${name}/rules.md: ${lines.length} lines (max 4, always-on)`);
      for (const key of ['COMMANDS:', 'FILES:', 'FORBIDDEN:']) {
        if (!read(rulesPath).includes(key)) err('profile', `${name}/rules.md: missing '${key}' line`);
      }
    }

    const cmdsPath = path.join(dir, 'commands.json');
    if (exists(cmdsPath)) {
      try {
        const cmds = JSON.parse(read(cmdsPath)).commands || {};
        for (const k of REQUIRED_COMMAND_KEYS) {
          if (!Object.prototype.hasOwnProperty.call(cmds, k)) err('profile', `${name}/commands.json: missing key '${k}'`);
        }
      } catch (e) { err('profile', `${name}/commands.json: invalid JSON (${e.message})`); }
    }

    const ctxPath = path.join(dir, 'context.md');
    if (exists(ctxPath)) {
      const ctx = read(ctxPath);
      if (!/^---\n/.test(ctx)) err('profile', `${name}/context.md: missing frontmatter`);
      if (!/\nthreshold:/.test(ctx)) err('profile', `${name}/context.md: missing 'threshold'`);
      checkRuleRefs(`${name}/context.md`, ctx, ruleNames);
    }

    const skillPath = path.join(dir, 'skills', 'SKILL.md');
    if (exists(skillPath)) {
      const skill = read(skillPath);
      const sections = new Set([...skill.matchAll(/^##\s+([a-z0-9-]+)/gm)].map(m => m[1]));
      // a11y section must exist (the a11y rule dereferences SKILL.md#a11y; N/A is allowed but must be a section)
      if (!sections.has('a11y')) err('profile', `${name}/skills/SKILL.md: missing '## a11y' section (a11y.md dereferences it)`);
      checkRuleRefs(`${name}/skills/SKILL.md`, skill, ruleNames);
      // Every skills/SKILL.md#section referenced from context.md must resolve.
      if (exists(ctxPath)) {
        for (const m of read(ctxPath).matchAll(/skills\/SKILL\.md#([a-z0-9-]+)/g)) {
          if (!sections.has(m[1])) err('profile', `${name}/context.md: references skills/SKILL.md#${m[1]} but no '## ${m[1]}' section exists`);
        }
      }
    }
  }
}

// ── Cross-ref: every ~/.claude/rules/<x>.md mentioned must exist in core/rules ──
function checkRuleRefs(rel, text, ruleNames) {
  for (const m of text.matchAll(/~\/\.claude\/rules\/([a-z0-9-]+)\.md/g)) {
    if (!ruleNames.has(m[1])) err('cross-ref', `${rel}: references ~/.claude/rules/${m[1]}.md which has no core/rules/${m[1]}.md`);
  }
}

// ── Handoff contract: generator, orchestrator doc, and deep commands must agree ─
function checkHandoff() {
  const gen = path.join(ROOT, 'install', 'print-handoff.js');
  if (!exists(gen)) { err('handoff', 'install/print-handoff.js missing (deterministic handoff generator)'); return; }
  const g = read(gen);
  for (const tok of ['FORGE_HANDOFF', 'FORGE_GENERIC_MODE', 'HANDOFF_VERSION', 'ACTIVE_PROFILES', 'FORGE_ROOT', 'FILE_ROUTING', 'COLLISION_RULE']) {
    if (!g.includes(tok)) err('handoff', `print-handoff.js no longer emits '${tok}' — update the contract consumers`);
  }
  const orch = path.join(ROOT, 'agents', 'stack-orchestrator.md');
  if (exists(orch)) {
    const o = read(orch);
    for (const tok of ['FORGE_HANDOFF', 'FORGE_GENERIC_MODE', 'HANDOFF_VERSION']) {
      if (!o.includes(tok)) err('handoff', `stack-orchestrator.md doesn't document '${tok}' (drifted from generator)`);
    }
  }
}

function main() {
  const ruleNames = new Set(listMd(path.join(ROOT, 'core', 'rules')).map(f => f.replace(/\.md$/, '')));
  const agents = collectAgents();
  const depthTable = parseDepthTable();

  checkAgents(agents, ruleNames);
  checkCommands(agents, ruleNames, depthTable);
  checkProfiles(ruleNames);
  checkHandoff();

  const errors = findings.filter(f => f.sev === 'ERROR');
  const warns = findings.filter(f => f.sev === 'WARN');

  process.stdout.write('\nforge-doctor — kit coherence audit\n');
  process.stdout.write('═'.repeat(47) + '\n');
  if (!findings.length) {
    process.stdout.write('  ✓ No issues. The kit is internally coherent.\n');
  } else {
    for (const f of [...errors, ...warns]) {
      process.stdout.write(`  ${f.sev === 'ERROR' ? '✗' : '⚠'} [${f.area}] ${f.msg}\n`);
    }
  }
  process.stdout.write('═'.repeat(47) + '\n');
  process.stdout.write(`  ${errors.length} error(s), ${warns.length} warning(s)\n`);
  process.exit(errors.length ? 1 : 0);
}

// CLAUDE.md "Command Depth" table → Map(/cmd → depth). Tolerant: returns empty on parse failure.
function parseDepthTable() {
  const table = new Map();
  const claudeMd = path.join(ROOT, 'CLAUDE.md');
  if (!exists(claudeMd)) return table;
  for (const line of read(claudeMd).split('\n')) {
    const depthMatch = line.match(/^\|\s*`(routine|deep|explore)`\s*\|/);
    if (!depthMatch) continue;
    for (const c of line.matchAll(/`(\/[a-z0-9-]+)`/g)) table.set(c[1], depthMatch[1]);
  }
  return table;
}

main();
