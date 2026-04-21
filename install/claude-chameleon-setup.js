#!/usr/bin/env node
/**
 * claude-chameleon-setup.js
 * One-time machine setup: symlinks core into ~/.claude and writes ~/.claude/.forge.yaml.
 * Profile activation happens per-project via /explore → activate-profiles.js.
 *
 * Usage:
 *   node claude-chameleon-setup.js
 *   node claude-chameleon-setup.js --validate
 *   node claude-chameleon-setup.js --dry-run
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { symlinkIfNeeded } = require('./lib/symlink');
const { mergeHooksIntoSettings, writeSettings, loadSettings } = require('./lib/hooks');
const { parseSimpleYaml, writeGlobalForgeYaml } = require('./lib/yaml');

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
for (const arg of args) {
  if (arg.startsWith('--')) flags[arg.slice(2)] = true;
}

const FORGE_ROOT = path.resolve(__dirname, '..');
const CLAUDE_DIR = path.join(process.env.HOME, '.claude');
const GLOBAL_FORGE_YAML = path.join(CLAUDE_DIR, '.forge.yaml');
const DRY_RUN = flags['dry-run'] === true;

// --remove-hooks: strip all forge.* hooks from ~/.claude/settings.json and exit.
// Called by uninstall.sh so machine-uninstall reuses the same hook-removal logic
// as activate-profiles.js instead of duplicating it in an inline node heredoc.
if (flags['remove-hooks']) {
  const { removeForgeHooksFromSettings, loadSettings, writeSettings } = require('./lib/hooks');
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    process.exit(0);
  }
  if (DRY_RUN) {
    process.stdout.write('[dry-run] would remove all forge.* hooks from settings.json\n');
    process.exit(0);
  }
  const settings = loadSettings(settingsPath);
  const cleaned = removeForgeHooksFromSettings(settings, 'forge.');
  if (Object.keys(cleaned).length === 0) {
    fs.unlinkSync(settingsPath);
    process.stdout.write('  ✓ settings.json removed (empty)\n');
  } else {
    writeSettings(settingsPath, cleaned);
    process.stdout.write('  ✓ forge.* hooks removed\n');
  }
  process.exit(0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(msg + '\n'); }
function warn(msg) { process.stderr.write(`⚠ ${msg}\n`); }
function err(msg) { process.stderr.write(`✗ ${msg}\n`); }
function ok(msg) { process.stdout.write(`✓ ${msg}\n`); }

// ─── Core Install ─────────────────────────────────────────────────────────────

function installCore() {
  log('\nInstalling core...');

  for (const dir of ['agents', 'commands', 'rules']) {
    const srcDir = path.join(FORGE_ROOT, 'core', dir);
    if (!fs.existsSync(srcDir)) continue;
    for (const file of fs.readdirSync(srcDir)) {
      symlinkIfNeeded(
        path.join(srcDir, file),
        path.join(CLAUDE_DIR, dir, file),
        DRY_RUN
      );
      log(`  core/${dir}/${file}`);
    }
  }

  for (const agentFile of ['stack-orchestrator.md', 'stack-orchestrator-messages.md']) {
    symlinkIfNeeded(
      path.join(FORGE_ROOT, 'agents', agentFile),
      path.join(CLAUDE_DIR, 'agents', agentFile),
      DRY_RUN
    );
    log(`  agents/${agentFile}`);
  }
}

function installCoreHooks() {
  log('\nMerging core hooks...');
  const coreHooksPath = path.join(FORGE_ROOT, 'core', 'hooks', 'hooks.json');
  if (!fs.existsSync(coreHooksPath)) {
    warn('core/hooks/hooks.json not found — skipping');
    return;
  }
  const hooksJson = JSON.parse(fs.readFileSync(coreHooksPath, 'utf8'));
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  if (DRY_RUN) {
    log('  [dry-run] would merge forge.core.* hooks into settings.json');
    return;
  }
  if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  const existing = loadSettings(settingsPath);
  const settings = mergeHooksIntoSettings(hooksJson, existing, FORGE_ROOT);
  writeSettings(settingsPath, settings);
  ok('settings.json updated');
}

function writeGlobalYaml() {
  log('\nWriting global config...');
  if (DRY_RUN) {
    log(`  [dry-run] would write ${GLOBAL_FORGE_YAML} with forge_root: ${FORGE_ROOT}`);
    return;
  }
  if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true });

  if (fs.existsSync(GLOBAL_FORGE_YAML)) {
    const existing = parseSimpleYaml(fs.readFileSync(GLOBAL_FORGE_YAML, 'utf8'));
    if (existing.forge_root && existing.forge_root !== FORGE_ROOT) {
      warn(`forge_root changing: ${existing.forge_root} → ${FORGE_ROOT}`);
    }
  }

  fs.writeFileSync(GLOBAL_FORGE_YAML, writeGlobalForgeYaml(FORGE_ROOT));
  ok(`~/.claude/.forge.yaml written (forge_root: ${FORGE_ROOT})`);
}

// ─── Validate ─────────────────────────────────────────────────────────────────

function validate() {
  log('\nValidating core installation...\n');
  let hasErrors = false;

  if (!fs.existsSync(GLOBAL_FORGE_YAML)) {
    err('~/.claude/.forge.yaml not found — run ./install.sh to install');
    process.exit(1);
  }

  const config = parseSimpleYaml(fs.readFileSync(GLOBAL_FORGE_YAML, 'utf8'));
  if (!config.forge_root || !fs.existsSync(config.forge_root)) {
    err(`forge_root '${config.forge_root}' is not readable. Re-run ./install.sh from the kit directory.`);
    hasErrors = true;
  }

  for (const dir of ['agents', 'commands', 'rules']) {
    const srcDir = path.join(FORGE_ROOT, 'core', dir);
    if (!fs.existsSync(srcDir)) continue;
    for (const file of fs.readdirSync(srcDir)) {
      const link = path.join(CLAUDE_DIR, dir, file);
      try {
        fs.accessSync(link, fs.constants.R_OK);
        ok(`${dir}/${file}`);
      } catch {
        err(`${dir}/${file} — BROKEN SYMLINK`);
        hasErrors = true;
      }
    }
  }

  // Check stack-orchestrator-messages.md symlink
  const orchMessages = path.join(CLAUDE_DIR, 'agents', 'stack-orchestrator-messages.md');
  try {
    fs.accessSync(orchMessages, fs.constants.R_OK);
    ok('agents/stack-orchestrator-messages.md');
  } catch {
    err('agents/stack-orchestrator-messages.md — BROKEN SYMLINK');
    hasErrors = true;
  }

  // Check core hooks are present in settings.json (IDs read from hooks.json, not hardcoded)
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  const coreHooksJsonPath = path.join(FORGE_ROOT, 'core', 'hooks', 'hooks.json');
  let requiredCoreHooks = [];
  try {
    const hooksJson = JSON.parse(fs.readFileSync(coreHooksJsonPath, 'utf8'));
    requiredCoreHooks = Object.values(hooksJson.hooks || {}).flat().flatMap(e => e.hooks || []).map(h => h.id);
  } catch {
    warn('core/hooks/hooks.json not readable — skipping hook validation');
  }
  if (requiredCoreHooks.length > 0) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const allHooks = Object.values(settings.hooks || {}).flat().flatMap(e => e.hooks || []).map(h => h.id);
      for (const hookId of requiredCoreHooks) {
        if (allHooks.includes(hookId)) {
          ok(`hook: ${hookId}`);
        } else {
          err(`hook: ${hookId} — not found in settings.json`);
          hasErrors = true;
        }
      }
    } catch {
      err('settings.json — not readable or not valid JSON');
      hasErrors = true;
    }
  }

  if (!hasErrors) {
    ok('Core installation healthy.');
  } else {
    err('\nRe-run ./install.sh to repair.');
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (process.env.OS === 'Windows_NT') {
  err('claude-chameleon requires WSL2 on Windows.');
  process.exit(1);
}

if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI) {
  warn('CI environment detected. Use FORGE_ROOT env var with activate-profiles.js in CI pipelines.');
}

if (flags.validate) {
  validate();
} else {
  installCore();
  installCoreHooks();
  writeGlobalYaml();
  log('\n✓ Core installed. Run /explore in your project to activate stack profiles.\n');

  // If the user is already inside a project with .forge.yaml, surface the activation path.
  const projectForgeYaml = path.join(process.cwd(), '.forge.yaml');
  if (fs.existsSync(projectForgeYaml)) {
    log('  Tip: .forge.yaml detected in current directory.');
    log('  To re-materialize profile symlinks: open Claude Code and run /explore\n');
  }
}
