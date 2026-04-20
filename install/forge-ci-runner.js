#!/usr/bin/env node
/**
 * forge-ci-runner.js
 * CI command runner. Reads .forge.yaml + commands.json at CI runtime.
 * Runs test, lint, typecheck, audit per active profile.
 * No Claude Code or full forge install required.
 *
 * Usage: node install/forge-ci-runner.js
 * Called by .github/workflows/forge.yml
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = process.cwd();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(msg + '\n'); }
function ok(label) { process.stdout.write(`✓ ${label}\n`); }
function fail(label, detail) {
  process.stderr.write(`✗ ${label}\n`);
  if (detail) process.stderr.write(detail + '\n');
}

function toolAvailable(tool) {
  const result = spawnSync('which', [tool], { encoding: 'utf8' });
  return result.status === 0;
}

function runCommand(cmd, label) {
  log(`\n→ ${label}: ${cmd}`);
  const [executable, ...cmdArgs] = cmd.split(/\s+/);

  // For complex commands with && or |, use shell
  const useShell = cmd.includes('&&') || cmd.includes('|') || cmd.includes(';');
  const result = useShell
    ? spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: PROJECT_ROOT, stdio: 'inherit' })
    : spawnSync(executable, cmdArgs, { encoding: 'utf8', cwd: PROJECT_ROOT, stdio: 'inherit' });

  if (result.status === 0) {
    ok(label);
    return true;
  } else {
    fail(label, `Exit code: ${result.status}`);
    return false;
  }
}

// ─── YAML Parser (minimal) ────────────────────────────────────────────────────

function parseSimpleYaml(content) {
  const result = {};
  const lines = content.split('\n').filter(l => !l.trim().startsWith('#') && l.trim());
  let currentKey = null;
  let currentList = null;
  let currentObj = null;

  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trimStart();

    if (indent === 0 && trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      currentKey = trimmed.slice(0, colonIdx).trim();
      const v = trimmed.slice(colonIdx + 1).trim();
      if (v === '') {
        result[currentKey] = [];
        currentList = result[currentKey];
        currentObj = null;
      } else {
        result[currentKey] = v.replace(/^["']|["']$/g, '');
        currentList = null;
      }
      continue;
    }

    if (indent === 2 && trimmed.startsWith('- ')) {
      const itemRaw = trimmed.slice(2);
      if (itemRaw.includes(':')) {
        currentObj = {};
        if (currentList) currentList.push(currentObj);
        const colonIdx = itemRaw.indexOf(':');
        const k = itemRaw.slice(0, colonIdx).trim();
        const v = itemRaw.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (v) currentObj[k] = v;
      } else {
        currentObj = null;
        if (currentList) currentList.push(itemRaw.trim().replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    if (indent === 4 && currentObj) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const k = trimmed.slice(0, colonIdx).trim();
        // Handle inline arrays: [a, b, c]
        const rawVal = trimmed.slice(colonIdx + 1).trim();
        if (rawVal.startsWith('[')) {
          currentObj[k] = rawVal.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        } else {
          currentObj[k] = rawVal.replace(/^["']|["']$/g, '');
        }
      }
    }
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Load .forge.yaml
  const forgeYamlPath = path.join(PROJECT_ROOT, '.forge.yaml');
  if (!fs.existsSync(forgeYamlPath)) {
    log('No .forge.yaml found. Running in generic mode — no forge CI checks.');
    process.exit(0);
  }

  const forgeConfig = parseSimpleYaml(fs.readFileSync(forgeYamlPath, 'utf8'));
  const forgeRoot = forgeConfig.forge_root;
  const profiles = forgeConfig.profiles || [];

  if (profiles.length === 0) {
    log('No profiles in .forge.yaml. No forge CI checks to run.');
    process.exit(0);
  }

  log('═══════════════════════════════════════════════════════');
  log('  Forge CI Runner');
  log(`  Project: ${PROJECT_ROOT}`);
  log(`  Profiles: ${profiles.map(p => p.name).join(', ')}`);
  log('═══════════════════════════════════════════════════════\n');

  // Load optional forge-ci.local.sh for custom steps
  const localCiPath = path.join(PROJECT_ROOT, 'forge-ci.local.sh');
  const hasLocalCi = fs.existsSync(localCiPath);

  let allPassed = true;
  const ran = new Set(); // track commands already run (avoid duplicates across profiles)

  for (const profile of profiles) {
    const profileName = profile.name;
    const commandsPath = forgeRoot
      ? path.join(forgeRoot, 'profiles', profileName, 'commands.json')
      : path.join(PROJECT_ROOT, 'node_modules', '.forge', profileName, 'commands.json');

    if (!fs.existsSync(commandsPath)) {
      fail(`Profile '${profileName}'`, `commands.json not found at ${commandsPath}`);
      allPassed = false;
      continue;
    }

    const commands = JSON.parse(fs.readFileSync(commandsPath, 'utf8')).commands || {};

    log(`\n─── Profile: ${profileName} ─────────────────────────────`);

    // Run each CI-relevant command
    for (const step of ['typecheck', 'lint', 'test', 'audit']) {
      const cmd = commands[step];
      if (!cmd) continue;

      const cmdKey = `${profileName}:${step}`;
      if (ran.has(cmd)) {
        log(`  (skipping duplicate: ${cmd})`);
        continue;
      }
      ran.add(cmd);

      // Tool availability check
      const tool = cmd.split(/\s+/)[0].replace(/^npx\s+/, '').split(/\s+/)[0];
      const toolName = cmd.startsWith('npx') ? cmd.split(/\s+/)[1] : tool;
      if (!cmd.startsWith('npx') && !toolAvailable(toolName)) {
        fail(`${step} (${profileName})`, `Tool '${toolName}' not found. Install it or skip this check.`);
        allPassed = false;
        continue;
      }

      const passed = runCommand(cmd, `${step} (${profileName})`);
      if (!passed) allPassed = false;
    }
  }

  // Source local CI additions
  if (hasLocalCi) {
    log('\n─── forge-ci.local.sh ───────────────────────────────────');
    const result = spawnSync('bash', [localCiPath], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      fail('forge-ci.local.sh', `Exit code: ${result.status}`);
      allPassed = false;
    } else {
      ok('forge-ci.local.sh');
    }
  }

  log('\n═══════════════════════════════════════════════════════');
  if (allPassed) {
    ok('All forge CI checks passed.');
    process.exit(0);
  } else {
    fail('One or more forge CI checks failed.');
    process.exit(1);
  }
}

main();
