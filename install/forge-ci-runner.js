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
  const result = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: PROJECT_ROOT, stdio: 'inherit' });

  if (result.status === 0) {
    ok(label);
    return true;
  } else {
    fail(label, `Exit code: ${result.status}`);
    return false;
  }
}

const { parseSimpleYaml } = require('./lib/yaml');

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Load .forge.yaml
  const forgeYamlPath = path.join(PROJECT_ROOT, '.forge.yaml');
  if (!fs.existsSync(forgeYamlPath)) {
    log('No .forge.yaml found. Running in generic mode — no forge CI checks.');
    process.exit(0);
  }

  const forgeConfig = parseSimpleYaml(fs.readFileSync(forgeYamlPath, 'utf8'));
  const profiles = forgeConfig.profiles || [];

  // forge_root resolution: FORGE_ROOT env var → ~/.claude/.forge.yaml → error
  let forgeRoot = process.env.FORGE_ROOT || null;
  if (!forgeRoot) {
    const globalYaml = path.join(process.env.HOME, '.claude', '.forge.yaml');
    if (fs.existsSync(globalYaml)) {
      const globalConfig = parseSimpleYaml(fs.readFileSync(globalYaml, 'utf8'));
      forgeRoot = globalConfig.forge_root || null;
    }
  }
  if (!forgeRoot) {
    fail('forge_root not found', 'Set FORGE_ROOT env var in CI or run ./install.sh to populate ~/.claude/.forge.yaml');
    process.exit(1);
  }

  if (profiles.length === 0) {
    log('No profiles in .forge.yaml. No forge CI checks to run.');
    process.exit(0);
  }

  log('═══════════════════════════════════════════════════════');
  log('  Forge CI Runner');
  log(`  Project: ${PROJECT_ROOT}`);
  log(`  Profiles: ${profiles.join(', ')}`);
  log('═══════════════════════════════════════════════════════\n');

  // Load optional forge-ci.local.sh for custom steps
  const localCiPath = path.join(PROJECT_ROOT, 'forge-ci.local.sh');
  const hasLocalCi = fs.existsSync(localCiPath);

  let allPassed = true;
  const ran = new Set(); // track commands already run (avoid duplicates across profiles)

  for (const profile of profiles) {
    const profileName = typeof profile === 'string' ? profile : profile.name;
    const commandsPath = forgeRoot
      ? path.join(forgeRoot, 'profiles', profileName, 'commands.json')
      : path.join(PROJECT_ROOT, 'node_modules', '.forge', profileName, 'commands.json');

    if (!fs.existsSync(commandsPath)) {
      fail(`Profile '${profileName}'`, `commands.json not found at ${commandsPath}`);
      allPassed = false;
      continue;
    }

    let commands = {};
    try {
      commands = JSON.parse(fs.readFileSync(commandsPath, 'utf8')).commands || {};
    } catch (e) {
      fail(`Profile '${profileName}'`, `commands.json is invalid JSON: ${e.message}`);
      allPassed = false;
      continue;
    }

    log(`\n─── Profile: ${profileName} ─────────────────────────────`);

    // Run each CI-relevant command
    for (const step of ['typecheck', 'lint', 'format-check', 'build', 'test', 'audit']) {
      const cmd = commands[step];
      if (!cmd) continue;

      if (ran.has(cmd)) {
        log(`  (skipping duplicate: ${cmd})`);
        continue;
      }
      ran.add(cmd);

      // Tool availability check — skip for package manager runners that handle installs themselves
      const toolName = cmd.split(/\s+/)[0];
      const selfInstallingTools = new Set(['npx', 'pnpm', 'yarn', 'bun']);
      if (!selfInstallingTools.has(toolName) && !toolAvailable(toolName)) {
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
