#!/usr/bin/env node
/**
 * forge-installer.js
 * All install logic: YAML parsing, detector scoring, schema validation, hook merging.
 * Called by install.sh as a thin bash wrapper.
 *
 * Usage:
 *   node forge-installer.js --detect --project <path>
 *   node forge-installer.js --profile typescript,nextjs --project <path>
 *   node forge-installer.js --validate --project <path>
 *   node forge-installer.js --dry-run --project <path>
 *   node forge-installer.js --generate-ci --project <path>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const readline = require('readline');

// ─── CLI Parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  }
}

const FORGE_ROOT = path.resolve(__dirname, '..');
const PROJECT_PATH = flags.project ? path.resolve(flags.project) : process.cwd();
const CLAUDE_DIR = path.join(process.env.HOME, '.claude');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(msg + '\n'); }
function warn(msg) { process.stderr.write(`⚠ ${msg}\n`); }
function error(msg) { process.stderr.write(`✗ ${msg}\n`); }
function success(msg) { process.stdout.write(`✓ ${msg}\n`); }

function readFileSafe(filePath, maxBytes = 1024 * 1024) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > maxBytes) {
      warn(`Skipping ${filePath} (${Math.round(stats.size / 1024)}KB > 1MB limit)`);
      return null;
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function question(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, answer => { rl.close(); resolve(answer.trim()); });
  });
}

// ─── Minimal YAML Frontmatter Parser ─────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result = {};

  let currentKey = null;
  let currentList = null;
  let currentObj = null;

  for (const rawLine of yaml.split('\n')) {
    const line = rawLine;
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    // Top-level key: value
    if (indent === 0 && trimmed.includes(':') && !trimmed.startsWith('-')) {
      const colonIdx = trimmed.indexOf(':');
      currentKey = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      if (val === '' || val === null) {
        result[currentKey] = [];
        currentList = result[currentKey];
        currentObj = null;
      } else if (val === 'true') {
        result[currentKey] = true;
        currentList = null;
      } else if (val === 'false') {
        result[currentKey] = false;
        currentList = null;
      } else if (!isNaN(Number(val))) {
        result[currentKey] = Number(val);
        currentList = null;
      } else {
        result[currentKey] = val.replace(/^["']|["']$/g, '');
        currentList = null;
      }
      continue;
    }

    // List item at indent 2
    if (indent === 2 && trimmed.startsWith('- ')) {
      const itemRaw = trimmed.slice(2).trim();
      if (itemRaw.includes(':')) {
        // Start of an object item
        currentObj = {};
        if (currentList) currentList.push(currentObj);
        const colonIdx = itemRaw.indexOf(':');
        const objKey = itemRaw.slice(0, colonIdx).trim();
        const objVal = itemRaw.slice(colonIdx + 1).trim();
        if (objVal) {
          currentObj[objKey] = parseYamlValue(objVal);
        }
      } else {
        currentObj = null;
        if (currentList) currentList.push(parseYamlValue(itemRaw));
      }
      continue;
    }

    // Object property at indent 4 (inside a list item)
    if (indent === 4 && currentObj !== null) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const objKey = trimmed.slice(0, colonIdx).trim();
        const objVal = trimmed.slice(colonIdx + 1).trim();
        currentObj[objKey] = parseYamlValue(objVal);
      }
    }
  }

  return result;
}

function parseYamlValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (!isNaN(Number(val)) && val !== '') return Number(val);
  // Handle [a, b] inline arrays
  if (val.startsWith('[') && val.endsWith(']')) {
    return val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
  }
  return val.replace(/^["']|["']$/g, '');
}

// ─── Profile Discovery ────────────────────────────────────────────────────────

function getAvailableProfiles() {
  const profilesDir = path.join(FORGE_ROOT, 'profiles');
  try {
    return fs.readdirSync(profilesDir)
      .filter(name => {
        const contextPath = path.join(profilesDir, name, 'context.md');
        return fs.existsSync(contextPath) && !name.startsWith('.');
      });
  } catch {
    return [];
  }
}

function loadProfileMeta(profileName) {
  const contextPath = path.join(FORGE_ROOT, 'profiles', profileName, 'context.md');
  const content = readFileSafe(contextPath);
  if (!content) return null;
  const meta = parseFrontmatter(content);
  meta._name = profileName;
  return meta;
}

// ─── Detector Scoring ─────────────────────────────────────────────────────────

function scoreProfile(meta, projectPath) {
  const detectors = meta.detectors || [];
  let score = 0;
  const signals = [];

  for (const detector of detectors) {
    if (detector.file) {
      const filePath = path.join(projectPath, detector.file);
      if (fs.existsSync(filePath)) {
        score += detector.weight;
        signals.push(`${detector.file} +${detector.weight}`);
      }
    } else if (detector.glob) {
      const result = globExists(detector.glob, projectPath);
      if (result) {
        score += detector.weight;
        signals.push(`${detector.glob} +${detector.weight}`);
      }
    } else if (detector['file-contains']) {
      const [filename, searchStr] = Array.isArray(detector['file-contains'])
        ? detector['file-contains']
        : [detector['file-contains']];
      const filePath = path.join(projectPath, filename);
      const content = readFileSafe(filePath);
      if (content && containsCaseInsensitive(content, searchStr)) {
        score += detector.weight;
        signals.push(`${filename}→${searchStr} +${detector.weight}`);
      }
    }
  }

  return { score, signals };
}

function containsCaseInsensitive(content, searchStr) {
  return content.toLowerCase().includes(searchStr.toLowerCase());
}

function globExists(pattern, cwd) {
  // Simple glob: convert ** to a find-like check
  try {
    const result = spawnSync('find', [cwd, '-name', path.basename(pattern), '-maxdepth', '8'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    return result.status === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// ─── Schema Validation ────────────────────────────────────────────────────────

function validateForgeYaml(config) {
  const errors = [];

  if (!config.forge_version) errors.push('Missing forge_version');
  if (!config.forge_root) errors.push('Missing forge_root');
  if (!Array.isArray(config.profiles)) errors.push('profiles must be an array');

  if (Array.isArray(config.profiles)) {
    for (const p of config.profiles) {
      if (!p.name) errors.push(`Profile missing 'name' field`);
      if (!Array.isArray(p.paths)) errors.push(`Profile '${p.name}' missing 'paths' array`);
    }
  }

  return errors;
}

function validateProfileHooks(hooksJson, profileName) {
  const errors = [];
  const hooks = hooksJson.hooks || {};
  const allHooks = [
    ...(hooks.PreToolUse || []).flatMap(h => h.hooks || []),
    ...(hooks.PostToolUse || []).flatMap(h => h.hooks || []),
    ...(hooks.Stop || []).flatMap(h => h.hooks || []),
  ];

  const namespacePattern = new RegExp(`^forge\\.${profileName.replace('.', '\\.')}\\.[a-z][a-z0-9-]*$`);
  for (const hook of allHooks) {
    if (!namespacePattern.test(hook.id)) {
      errors.push(`Hook ID '${hook.id}' must follow forge.${profileName}.<name> convention`);
    }
  }

  return errors;
}

// ─── Hook Merging ─────────────────────────────────────────────────────────────

function mergeHooksIntoSettings(hooksJson, settingsPath) {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      warn(`Could not parse ${settingsPath} — creating fresh`);
    }
  }

  if (!settings.hooks) settings.hooks = {};

  const incoming = hooksJson.hooks || {};
  for (const phase of ['PreToolUse', 'PostToolUse', 'Stop']) {
    if (!incoming[phase]) continue;
    if (!settings.hooks[phase]) settings.hooks[phase] = [];

    for (const entry of incoming[phase]) {
      for (const hook of entry.hooks || []) {
        // Remove existing hook with same ID before re-adding (idempotent)
        settings.hooks[phase] = settings.hooks[phase].filter(
          existingEntry => !(existingEntry.hooks || []).some(h => h.id === hook.id)
        );
        // Replace {{FORGE_ROOT}} placeholder
        const resolvedHook = {
          ...hook,
          command: hook.command.replace(/\{\{FORGE_ROOT\}\}/g, FORGE_ROOT),
        };
        settings.hooks[phase].push({ hooks: [resolvedHook], matcher: entry.matcher });
      }
    }
  }

  return settings;
}

function removeForgeHooksFromSettings(settings, prefix) {
  const hooks = settings.hooks || {};
  for (const phase of ['PreToolUse', 'PostToolUse', 'Stop']) {
    if (!hooks[phase]) continue;
    hooks[phase] = hooks[phase].map(entry => ({
      ...entry,
      hooks: (entry.hooks || []).filter(h => !h.id.startsWith(prefix)),
    })).filter(entry => (entry.hooks || []).length > 0);
    if (hooks[phase].length === 0) delete hooks[phase];
  }
  return settings;
}

// ─── Install ──────────────────────────────────────────────────────────────────

function symlinkIfNeeded(src, dest, dryRun) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    if (!dryRun) fs.mkdirSync(destDir, { recursive: true });
  }

  if (fs.existsSync(dest) || fs.lstatSync(dest).isSymbolicLink()) {
    if (!dryRun) fs.unlinkSync(dest);
  }

  if (dryRun) {
    log(`  [dry-run] symlink ${src} → ${dest}`);
  } else {
    fs.symlinkSync(src, dest);
  }
}

async function installProfiles(profileNames, dryRun) {
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  let settings = {};

  // Validate all profiles first
  for (const name of profileNames) {
    const hooksPath = path.join(FORGE_ROOT, 'profiles', name, 'hooks.json');
    if (fs.existsSync(hooksPath)) {
      const hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      const errors = validateProfileHooks(hooksJson, name);
      if (errors.length > 0) {
        error(`Profile '${name}' hooks validation failed:\n  ${errors.join('\n  ')}`);
        process.exit(1);
      }
    }
  }

  // Symlink core
  log('\nInstalling core...');
  for (const dir of ['agents', 'commands', 'rules']) {
    const srcDir = path.join(FORGE_ROOT, 'core', dir);
    if (!fs.existsSync(srcDir)) continue;
    for (const file of fs.readdirSync(srcDir)) {
      symlinkIfNeeded(
        path.join(srcDir, file),
        path.join(CLAUDE_DIR, dir, file),
        dryRun
      );
      log(`  core/${dir}/${file}`);
    }
  }

  // Symlink orchestrator
  symlinkIfNeeded(
    path.join(FORGE_ROOT, 'agents', 'stack-orchestrator.md'),
    path.join(CLAUDE_DIR, 'agents', 'stack-orchestrator.md'),
    dryRun
  );
  log('  agents/stack-orchestrator.md');

  // Install profiles
  for (const name of profileNames) {
    log(`\nInstalling profile: ${name}`);

    // Symlink rules.md (always-on)
    const rulesPath = path.join(FORGE_ROOT, 'profiles', name, 'rules.md');
    if (fs.existsSync(rulesPath)) {
      symlinkIfNeeded(
        rulesPath,
        path.join(CLAUDE_DIR, 'rules', `profile-${name}.md`),
        dryRun
      );
      log(`  rules/profile-${name}.md`);
    }

    // Merge hooks.json into settings
    const hooksPath = path.join(FORGE_ROOT, 'profiles', name, 'hooks.json');
    if (fs.existsSync(hooksPath)) {
      const hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      if (!dryRun) {
        settings = mergeHooksIntoSettings(hooksJson, settingsPath);
      }
      log(`  hooks merged (forge.${name}.*)`);
    }

    // Merge core hooks too (first profile triggers core merge)
    if (name === profileNames[0]) {
      const coreHooksPath = path.join(FORGE_ROOT, 'core', 'hooks', 'hooks.json');
      if (fs.existsSync(coreHooksPath)) {
        const coreHooks = JSON.parse(fs.readFileSync(coreHooksPath, 'utf8'));
        if (!dryRun) {
          settings = mergeHooksIntoSettings(coreHooks, settingsPath);
        }
        log('  core hooks merged (forge.core.*)');
      }
    }
  }

  if (!dryRun && Object.keys(settings).length > 0) {
    if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    success('settings.json updated');
  }
}

function writeForgeYaml(profileNames, projectPath, dryRun) {
  const forgeYamlPath = path.join(projectPath, '.forge.yaml');

  const profileEntries = profileNames.map(name => {
    const commandsPath = path.join(FORGE_ROOT, 'profiles', name, 'commands.json');
    let patterns = [`**/*`];
    if (fs.existsSync(commandsPath)) {
      const cmd = JSON.parse(fs.readFileSync(commandsPath, 'utf8'));
      patterns = (cmd.filePatterns || []).map(p => path.resolve(projectPath, p));
    }
    return `  - name: ${name}\n    paths: [${patterns.map(p => `"${p}"`).join(', ')}]`;
  }).join('\n');

  const content = `# Generated by claude-chameleon install.sh
# Commit this file to share forge configuration with your team.
forge_version: "1.0.0"
forge_root: "${FORGE_ROOT}"
profiles:
${profileEntries}
`;

  if (dryRun) {
    log('\n[dry-run] Would write .forge.yaml:');
    log(content);
  } else {
    fs.writeFileSync(forgeYamlPath, content);
    success(`.forge.yaml written to ${forgeYamlPath}`);
  }
}

// ─── Validate ─────────────────────────────────────────────────────────────────

function validateInstallation(projectPath) {
  log('\nValidating forge installation...\n');
  let hasErrors = false;

  // Check .forge.yaml
  const forgeYamlPath = path.join(projectPath, '.forge.yaml');
  if (!fs.existsSync(forgeYamlPath)) {
    warn('.forge.yaml not found — run ./install.sh --detect to configure');
    return;
  }

  const config = parseSimpleYaml(fs.readFileSync(forgeYamlPath, 'utf8'));
  const schemaErrors = validateForgeYaml(config);
  if (schemaErrors.length > 0) {
    error(`.forge.yaml schema errors:\n  ${schemaErrors.join('\n  ')}`);
    hasErrors = true;
  }

  // Check forge_root
  const forgeRoot = config.forge_root;
  if (!forgeRoot || !fs.existsSync(forgeRoot)) {
    error(`forge_root '${forgeRoot}' is not readable. Re-run install.sh.`);
    hasErrors = true;
  }

  // Check symlinks
  for (const profile of config.profiles || []) {
    const rulesLink = path.join(CLAUDE_DIR, 'rules', `profile-${profile.name}.md`);
    try {
      fs.accessSync(rulesLink, fs.constants.R_OK);
      success(`rules/profile-${profile.name}.md`);
    } catch {
      error(`rules/profile-${profile.name}.md — BROKEN SYMLINK`);
      hasErrors = true;
    }
  }

  // Check path stale warnings
  for (const profile of config.profiles || []) {
    for (const p of profile.paths || []) {
      const basePattern = p.replace(/\/\*\*.*$/, '');
      if (!fs.existsSync(basePattern)) {
        warn(`profile '${profile.name}' path '${p}' matches 0 files. Update .forge.yaml if directory moved.`);
      }
    }
  }

  if (!hasErrors) {
    success('All forge symlinks healthy.');
  } else {
    error('\nFix the issues above, then re-run: ./install.sh --project .');
    process.exit(1);
  }
}

// ─── Detect ───────────────────────────────────────────────────────────────────

async function detectProfiles(projectPath, dryRun) {
  const profiles = getAvailableProfiles();

  if (profiles.length === 0) {
    error('No profiles found in profiles/');
    process.exit(1);
  }

  log('\nScanning project...\n');
  log('  Profile scores:');

  const detected = [];
  const notDetected = [];

  for (const name of profiles) {
    if (name === 'tests') continue;
    const meta = loadProfileMeta(name);
    if (!meta) continue;

    const threshold = meta.threshold || 5;
    const { score, signals } = scoreProfile(meta, projectPath);

    if (score >= threshold) {
      detected.push({ name, score, signals, threshold });
      log(`  ✓ ${name.padEnd(20)} score ${score}  [${signals.join(', ')}]`);
    } else {
      notDetected.push({ name, score, signals, threshold });
      log(`  ✗ ${name.padEnd(20)} score ${score}  ${signals.length ? `[${signals.join(', ')}]` : '— no signals found'} — below threshold ${threshold}`);
    }
  }

  log('');

  if (detected.length === 0) {
    log('No profiles scored above threshold.');
    if (notDetected.length > 0) {
      log('\nSignals found:');
      for (const { name, score, signals } of notDetected) {
        if (signals.length > 0) log(`  ${name}: score ${score} [${signals.join(', ')}]`);
      }
    }
    log('\nOptions:');
    log('  1. Run with --profile to specify: ./install.sh --profile typescript --project .');
    log('  2. Review AUTHORING.md to check detector thresholds');
    log('  3. Continue in generic mode (no profiles)');
    process.exit(0);
  }

  const profileNames = detected.map(d => d.name);
  log(`Profiles to activate: ${profileNames.join(', ')}`);
  log(`Order (first = highest priority on collision): ${profileNames.join(' > ')}\n`);

  if (dryRun) {
    log('[dry-run] Would generate .forge.yaml and install profiles.');
    return;
  }

  const answer = await question('Generate .forge.yaml with these profiles? [Y/n] ');
  if (answer.toLowerCase() === 'n') {
    log('\nSkipping .forge.yaml generation.');
    log('Running in generic mode — no active profiles.');
    log('Run ./install.sh --detect --project . any time to configure.');
    process.exit(0);
  }

  await installProfiles(profileNames, dryRun);
  writeForgeYaml(profileNames, projectPath, dryRun);
  generateCiWorkflow(projectPath, dryRun);
}

// ─── CI Workflow Generation ───────────────────────────────────────────────────

function generateCiWorkflow(projectPath, dryRun) {
  const githubDir = path.join(projectPath, '.github', 'workflows');
  if (!fs.existsSync(path.join(projectPath, '.github'))) {
    log('No .github/ directory found — skipping CI workflow generation.');
    return;
  }

  const workflowPath = path.join(githubDir, 'forge.yml');
  const forgeRootInProject = path.relative(projectPath, FORGE_ROOT) || '.';

  const content = `# Generated by claude-chameleon install.sh
# Commit this file. forge-ci-runner.js reads .forge.yaml at CI runtime.
name: Forge CI
on: [push, pull_request]
jobs:
  forge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Run forge CI checks
        run: node ${forgeRootInProject}/install/forge-ci-runner.js
        working-directory: \${{ github.workspace }}
`;

  if (dryRun) {
    log('\n[dry-run] Would write .github/workflows/forge.yml');
  } else {
    if (!fs.existsSync(githubDir)) fs.mkdirSync(githubDir, { recursive: true });
    fs.writeFileSync(workflowPath, content);
    success('.github/workflows/forge.yml written');
  }
}

// ─── Simple YAML for .forge.yaml (not frontmatter) ───────────────────────────

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
      const [k, ...vParts] = trimmed.split(':');
      currentKey = k.trim();
      const v = vParts.join(':').trim();
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
        const [k, ...vParts] = itemRaw.split(':');
        const v = vParts.join(':').trim().replace(/^["']|["']$/g, '');
        if (v) currentObj[k.trim()] = v;
      } else {
        currentObj = null;
        if (currentList) currentList.push(itemRaw.trim().replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    if (indent === 4 && currentObj) {
      const [k, ...vParts] = trimmed.split(':');
      const v = vParts.join(':').trim().replace(/^["']|["']$/g, '');
      currentObj[k.trim()] = v;
    }
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Windows check
  if (process.env.OS === 'Windows_NT') {
    error('claude-chameleon requires WSL2 on Windows. Install WSL2 and re-run from a WSL terminal.');
    process.exit(1);
  }

  // CI warning
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI) {
    warn('CI environment detected. Symlinks may not work across volume boundaries.');
    warn('Forge hooks will not fire in CI — use forge-ci-runner.js instead.');
  }

  const dryRun = flags['dry-run'] === true;

  if (flags.validate) {
    validateInstallation(PROJECT_PATH);
  } else if (flags.detect) {
    await detectProfiles(PROJECT_PATH, dryRun);
  } else if (flags.profile) {
    const profileNames = flags.profile.split(',').map(s => s.trim());
    await installProfiles(profileNames, dryRun);
    writeForgeYaml(profileNames, PROJECT_PATH, dryRun);
    generateCiWorkflow(PROJECT_PATH, dryRun);
  } else if (flags['generate-ci']) {
    generateCiWorkflow(PROJECT_PATH, dryRun);
  } else {
    log('Usage:');
    log('  node forge-installer.js --detect --project <path>');
    log('  node forge-installer.js --profile typescript,nextjs --project <path>');
    log('  node forge-installer.js --validate --project <path>');
    log('  node forge-installer.js --dry-run --detect --project <path>');
    process.exit(1);
  }
}

main().catch(err => {
  error(err.message);
  process.exit(1);
});
