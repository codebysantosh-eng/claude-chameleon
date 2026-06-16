#!/usr/bin/env node
'use strict';

/*
 * print-handoff.js — deterministic generator for the stack-orchestrator handoff.
 *
 * The handoff block is a pure function of files on disk (the project `.forge.yaml`
 * plus each active profile's `commands.json` / `rules.md`). Generating it here —
 * instead of asking an LLM to read files and re-format a block — removes all
 * formatting drift: the contract below is emitted byte-for-byte every run.
 *
 * Usage:
 *   node install/print-handoff.js [--project <dir>] [--forge-root <dir>]
 *
 * --project    Directory to resolve the project root from (default: cwd). The
 *              project root is the nearest ancestor containing `.git`, else the dir itself.
 * --forge-root Override the kit root (default: self-located as the parent of install/).
 *
 * Output (success):
 *   ✓ Forge profiles loaded.
 *
 *   <<<FORGE_HANDOFF>>>
 *   HANDOFF_VERSION: 1
 *   ACTIVE_PROFILES: <name> | <glob> | test:<cmd> | lint:<cmd>   (one line per profile)
 *   FORGE_ROOT: <absolute path>
 *   FILE_ROUTING: .ext,.ext → <profile>                          (one line per profile with exts)
 *   COLLISION_RULE: first listed profile wins
 *   <<<END_FORGE_HANDOFF>>>
 *
 * Output (any failure — explicit, never silent):
 *   <<<FORGE_GENERIC_MODE>>>
 *   HANDOFF_VERSION: 1
 *   REASON: <code>          (forge-root-not-readable | no-forge-yaml | broken-profile)
 *   DETAIL: <human detail>
 *   <<<END_FORGE_GENERIC_MODE>>>
 *
 * Always exits 0 — generic mode is a valid outcome for the caller, not a crash.
 * The "not-installed" reason is owned by the orchestrator (it cannot locate this
 * script without forge_root); every other failure is reported here.
 */

const fs = require('fs');
const path = require('path');
const { parseSimpleYaml } = require('./lib/yaml');

const HANDOFF_VERSION = 1;

function parseArgs(argv) {
  const args = { project: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--project') args.project = argv[++i];
    else if (argv[i] === '--forge-root') args.forgeRoot = argv[++i];
  }
  return args;
}

function emit(text) {
  process.stdout.write(text.endsWith('\n') ? text : text + '\n');
}

function genericBlock(reason, detail) {
  return [
    '<<<FORGE_GENERIC_MODE>>>',
    `HANDOFF_VERSION: ${HANDOFF_VERSION}`,
    `REASON: ${reason}`,
    `DETAIL: ${detail}`,
    '<<<END_FORGE_GENERIC_MODE>>>',
  ].join('\n');
}

// Nearest ancestor containing `.git`; falls back to the start dir if none found.
function findProjectRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

// Extract the file extension from a glob pattern: "app/**/*.tsx" → "tsx"; "prisma/migrations/**" → null.
function extOf(pattern) {
  const m = String(pattern).match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1] : null;
}

function readProfile(profilesDir, name) {
  const pdir = path.join(profilesDir, name);
  const rulesPath = path.join(pdir, 'rules.md');
  if (!fs.existsSync(rulesPath)) {
    return { error: `Profile '${name}' is missing rules.md (looked in ${pdir})` };
  }
  let commands = Object.create(null);
  let filePatterns = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(pdir, 'commands.json'), 'utf8'));
    commands = parsed.commands || Object.create(null);
    filePatterns = Array.isArray(parsed.filePatterns) ? parsed.filePatterns : [];
  } catch {
    // commands.json absent or malformed — degrade to blanks rather than fail the whole handoff.
  }
  return { name, commands, filePatterns };
}

function buildHandoff(forgeRoot, profileResults) {
  const activeLines = [];
  const routingLines = [];
  const claimed = new Set(); // extension → first profile wins

  for (const p of profileResults) {
    const glob = p.filePatterns[0] || '(see rules.md FILES)';
    const testCmd = p.commands.test || 'none';
    const lintCmd = p.commands.lint || 'none';
    activeLines.push(`ACTIVE_PROFILES: ${p.name} | ${glob} | test:${testCmd} | lint:${lintCmd}`);

    const exts = [];
    for (const pattern of p.filePatterns) {
      const e = extOf(pattern);
      if (e && !claimed.has(e)) { claimed.add(e); exts.push('.' + e); }
    }
    if (exts.length) routingLines.push(`FILE_ROUTING: ${exts.join(',')} → ${p.name}`);
  }

  return [
    '✓ Forge profiles loaded.',
    '',
    '<<<FORGE_HANDOFF>>>',
    `HANDOFF_VERSION: ${HANDOFF_VERSION}`,
    ...activeLines,
    `FORGE_ROOT: ${forgeRoot}`,
    ...routingLines,
    'COLLISION_RULE: first listed profile wins',
    '<<<END_FORGE_HANDOFF>>>',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const forgeRoot = args.forgeRoot ? path.resolve(args.forgeRoot) : path.resolve(__dirname, '..');

  if (!fs.existsSync(forgeRoot) || !fs.statSync(forgeRoot).isDirectory()) {
    return emit(genericBlock('forge-root-not-readable', `forge_root is not a readable directory: ${forgeRoot}`));
  }
  const profilesDir = path.join(forgeRoot, 'profiles');
  if (!fs.existsSync(profilesDir)) {
    return emit(genericBlock('forge-root-not-readable', `profiles directory missing under forge_root: ${profilesDir}`));
  }

  const projectRoot = findProjectRoot(args.project);
  const projectYaml = path.join(projectRoot, '.forge.yaml');
  if (!fs.existsSync(projectYaml)) {
    return emit(genericBlock('no-forge-yaml', `No .forge.yaml found at project root ${projectRoot}`));
  }

  let cfg;
  try {
    cfg = parseSimpleYaml(fs.readFileSync(projectYaml, 'utf8'));
  } catch (e) {
    return emit(genericBlock('no-forge-yaml', `Could not read .forge.yaml at ${projectYaml}: ${e.message}`));
  }
  const profiles = Array.isArray(cfg.profiles) ? cfg.profiles.filter(Boolean) : [];
  if (profiles.length === 0) {
    return emit(genericBlock('no-forge-yaml', `.forge.yaml at ${projectRoot} lists no profiles`));
  }

  const profileResults = [];
  for (const name of profiles) {
    const result = readProfile(profilesDir, name);
    if (result.error) {
      return emit(genericBlock('broken-profile', result.error));
    }
    profileResults.push(result);
  }

  emit(buildHandoff(forgeRoot, profileResults));
}

main();
