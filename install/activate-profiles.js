#!/usr/bin/env node
/**
 * activate-profiles.js
 * Per-project profile activator. Invoked by /explore after codebase mapping.
 * Detects stack, creates machine-specific symlinks in .claude/rules.local/,
 * and writes machine-specific hooks to .claude/settings.local.json.
 *
 * Usage:
 *   node activate-profiles.js --project <path> [--yes] [--dry-run] [--uninstall]
 *   node activate-profiles.js --project <path> --forge-root <path>  # for testing
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

const { symlinkIfNeeded, pruneProfileSymlinks } = require('./lib/symlink');
const { mergeHooksIntoSettings, removeForgeHooksFromSettings, writeSettings, loadSettings } = require('./lib/hooks');
const { mergeMcpIntoSettings, collectMcpServerNames, removeMcpServersFromSettings, parseEnvFile } = require('./lib/mcp');
const { parseSimpleYaml, writeProjectForgeYaml, parseFrontmatter } = require('./lib/yaml');

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  }
}

const PROJECT_PATH = flags.project ? path.resolve(flags.project) : process.cwd();
const DRY_RUN = flags['dry-run'] === true;
const YES = flags.yes === true;
const UNINSTALL = flags.uninstall === true;
// --profiles typescript,nextjs  →  skip detection, activate these profiles directly
const MANUAL_PROFILES = flags.profiles && typeof flags.profiles === 'string'
  ? flags.profiles.split(',').map(s => s.trim()).filter(Boolean)
  : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(msg + '\n'); }
function warn(msg) { process.stderr.write(`⚠ ${msg}\n`); }
function err(msg) { process.stderr.write(`✗ ${msg}\n`); }
function ok(msg) { process.stdout.write(`✓ ${msg}\n`); }

function readFileSafe(filePath, maxBytes = 1024 * 1024) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > maxBytes) { warn(`Skipping ${filePath} (too large)`); return null; }
    return fs.readFileSync(filePath, 'utf8');
  } catch { return null; }
}

function question(prompt) {
  if (!process.stdin.isTTY) {
    log(`${prompt}(auto-yes: non-interactive)`);
    return Promise.resolve('y');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, answer => { rl.close(); resolve(answer.trim()); });
  });
}

// ─── forge_root Resolution ────────────────────────────────────────────────────

function resolveForgeRoot() {
  if (flags['forge-root']) return path.resolve(flags['forge-root']);
  if (process.env.FORGE_ROOT) return path.resolve(process.env.FORGE_ROOT);

  const globalYaml = path.join(process.env.HOME, '.claude', '.forge.yaml');
  const content = readFileSafe(globalYaml);
  if (content) {
    const config = parseSimpleYaml(content);
    if (config.forge_root && fs.existsSync(config.forge_root)) return config.forge_root;
  }

  return null;
}

// ─── Profile Detection ────────────────────────────────────────────────────────

function getAvailableProfiles(forgeRoot) {
  const profilesDir = path.join(forgeRoot, 'profiles');
  try {
    return fs.readdirSync(profilesDir).filter(name =>
      !name.startsWith('.') &&
      name !== 'tests' &&
      fs.existsSync(path.join(profilesDir, name, 'context.md'))
    );
  } catch { return []; }
}

/**
 * Build a relative-path inventory of all files in projectPath (single find call).
 * All glob detector checks run against this in-memory set — no per-detector subprocesses.
 */
function buildFileInventory(projectPath) {
  try {
    const result = spawnSync(
      'find', [projectPath, '-maxdepth', '8', '-type', 'f', '-not', '-path', '*/.git/*'],
      { encoding: 'utf8', timeout: 10000 }
    );
    if (result.status !== 0) return new Set();
    return new Set(
      result.stdout.trim().split('\n').filter(Boolean).map(p => path.relative(projectPath, p))
    );
  } catch { return new Set(); }
}

function globToRegex(pattern) {
  // Order matters: mark ** before escaping, replace * after.
  const rx = pattern
    .replace(/\*\*\//g, '\x00DS\x00')   // **/ → zero-or-more path segments
    .replace(/\*\*/g, '\x00D\x00')       // ** at end
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials
    .replace(/\*/g, '[^/]*')              // single * → non-slash chars
    .replace(/\x00DS\x00/g, '(?:.*/)?')
    .replace(/\x00D\x00/g, '.*');
  return new RegExp('^' + rx + '$');
}

function globMatchesInventory(pattern, inventory) {
  const regex = globToRegex(pattern);
  for (const filePath of inventory) {
    if (regex.test(filePath)) return true;
  }
  return false;
}

function scoreProfile(meta, projectPath, inventory) {
  let score = 0;
  const signals = [];

  for (const detector of meta.detectors || []) {
    if (detector.file) {
      if (fs.existsSync(path.join(projectPath, detector.file))) {
        score += detector.weight;
        signals.push(`${detector.file} +${detector.weight}`);
      }
    } else if (detector.glob) {
      if (globMatchesInventory(detector.glob, inventory)) {
        score += detector.weight;
        signals.push(`${detector.glob} +${detector.weight}`);
      }
    } else if (detector['file-contains']) {
      const [filename, searchStr] = Array.isArray(detector['file-contains'])
        ? detector['file-contains'] : [detector['file-contains']];
      const content = readFileSafe(path.join(projectPath, filename));
      if (content && content.toLowerCase().includes((searchStr || '').toLowerCase())) {
        score += detector.weight;
        signals.push(`${filename}→${searchStr} +${detector.weight}`);
      }
    }
  }

  return { score, signals };
}

function detectProfiles(forgeRoot, projectPath) {
  const profiles = getAvailableProfiles(forgeRoot);
  const detected = [];

  log('\nScanning project...\n  Profile scores:');

  // Build file inventory once — all glob detectors check against this in-memory set.
  const inventory = buildFileInventory(projectPath);

  for (const name of profiles) {
    const contextPath = path.join(forgeRoot, 'profiles', name, 'context.md');
    const content = readFileSafe(contextPath);
    if (!content) continue;

    const meta = parseFrontmatter(content);

    // Validate frontmatter — surface errors instead of silently scoring 0.
    if (!meta.detectors || !Array.isArray(meta.detectors) || meta.detectors.length === 0) {
      warn(`profiles/${name}/context.md: no detectors in frontmatter — skipping profile`);
      continue;
    }
    if (meta.threshold == null) {
      warn(`profiles/${name}/context.md: no threshold in frontmatter — defaulting to 5`);
    }

    meta._name = name;
    const threshold = meta.threshold ?? 5;
    const { score, signals } = scoreProfile(meta, projectPath, inventory);

    if (score >= threshold) {
      detected.push({ name, score, signals });
      log(`  ✓ ${name.padEnd(20)} score ${score}  [${signals.join(', ')}]`);
    } else {
      log(`  ✗ ${name.padEnd(20)} score ${score}  ${signals.length ? `[${signals.join(', ')}]` : '— no signals'} — below threshold ${threshold}`);
    }
  }

  log('');
  detected.sort((a, b) => b.score - a.score);
  return detected;
}

// ─── Missing Profile Detection ────────────────────────────────────────────────

/**
 * Detects tech stacks present in the project and checks if profiles exist for them.
 * Reports missing profiles to help users know what profiles could be created.
 */
function checkForMissingProfiles(forgeRoot, projectPath, detectedProfiles) {
  const availableProfiles = getAvailableProfiles(forgeRoot);
  const detectedNames = detectedProfiles.map(d => d.name);

  // Map tech stacks to their profile names for missing detection
  const techStackIndicators = {
    'php-laravel': [
      { file: 'composer.json', contains: 'laravel/framework' },
      { file: 'artisan' }
    ],
    'python-django': [
      { file: 'manage.py' },
      { file: 'requirements.txt', contains: 'django' },
      { file: 'pyproject.toml', contains: 'django' }
    ],
    'python-fastapi': [
      { file: 'pyproject.toml', contains: 'fastapi' },
      { file: 'requirements.txt', contains: 'fastapi' }
    ],
    'go': [
      { file: 'go.mod' },
      { glob: 'cmd/**/*.go' }
    ],
    'rust': [
      { file: 'Cargo.toml' }
    ]
  };

  const missingStacks = [];

  for (const [stackName, indicators] of Object.entries(techStackIndicators)) {
    // Skip if this profile is already detected and available
    if (detectedNames.includes(stackName)) continue;
    if (!availableProfiles.includes(stackName)) continue;

    // Check if any indicator matches
    let matches = false;
    for (const indicator of indicators) {
      if (indicator.file) {
        if (fs.existsSync(path.join(projectPath, indicator.file))) {
          if (indicator.contains) {
            const content = readFileSafe(path.join(projectPath, indicator.file));
            if (content && content.toLowerCase().includes((indicator.contains || '').toLowerCase())) {
              matches = true;
              break;
            }
          } else {
            matches = true;
            break;
          }
        }
      }
    }

    if (matches) {
      missingStacks.push(stackName);
    }
  }

  if (missingStacks.length > 0) {
    log('\n⚠  Potential additional profiles available:');
    for (const stack of missingStacks) {
      log(`  • ${stack} — activate with: node install/activate-profiles.js --project . --profiles ${[...detectedNames, stack].join(',')}`);
    }
  }
}

// ─── Activation ───────────────────────────────────────────────────────────────

function activateProfiles(forgeRoot, profileNames, projectPath) {
  const claudeDir = path.join(projectPath, '.claude');
  const rulesDir = path.join(claudeDir, 'rules.local');
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const profilesDir = path.join(forgeRoot, 'profiles');

  // Remove stale profile symlinks before creating new ones
  const keepTargets = profileNames.map(name => path.join(profilesDir, name, 'rules.md'));
  pruneProfileSymlinks(rulesDir, profilesDir, keepTargets, DRY_RUN);

  // Read existing settings once so hook merges across all profiles accumulate correctly.
  let settings = DRY_RUN ? {} : loadSettings(settingsPath);
  // Track MCP server names registered in this activation run to prevent cross-profile
  // clean-then-add from wiping a sibling profile's server when both use the same name.
  const registeredThisRun = new Set();

  for (const name of profileNames) {
    log(`\nActivating profile: ${name}`);

    const rulesSource = path.join(profilesDir, name, 'rules.md');
    if (fs.existsSync(rulesSource)) {
      symlinkIfNeeded(rulesSource, path.join(rulesDir, `${name}.md`), DRY_RUN);
      log(`  .claude/rules.local/${name}.md → profiles/${name}/rules.md`);
    }

    const hooksPath = path.join(profilesDir, name, 'hooks.json');
    if (fs.existsSync(hooksPath)) {
      const hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      const incomingPhases = Object.keys(hooksJson.hooks || {});
      const hookIds = incomingPhases.flatMap(p => (hooksJson.hooks[p] || []).flatMap(e => (e.hooks || []).map(h => h.id)));
      if (!DRY_RUN) settings = mergeHooksIntoSettings(hooksJson, settings, forgeRoot);
      if (DRY_RUN) {
        log(`  [dry-run] would merge hooks: ${hookIds.join(', ')}`);
      } else {
        log(`  hooks merged → .claude/settings.local.json (forge.${name}.*)`);
      }
    }

    const mcpPath = path.join(profilesDir, name, 'mcp.json');
    if (fs.existsSync(mcpPath)) {
      const mcpJson = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      if (!DRY_RUN) {
        // Clean-then-add: remove previously registered servers for this profile
        // (including any auto-renamed variants) before re-merging. Prevents duplicates on re-run.
        // Exclude servers registered by earlier profiles in this run to avoid cross-profile wipe.
        const existingNames = collectMcpServerNames(mcpJson, settings, name)
          .filter(n => !registeredThisRun.has(n));
        if (existingNames.length > 0) settings = removeMcpServersFromSettings(settings, existingNames, claudeDir);

        const envVars = { ...parseEnvFile(projectPath), PROJECT_ROOT: projectPath, FORGE_ROOT: forgeRoot };
        const { settings: s, added, skipped, warnEnv } = mergeMcpIntoSettings(mcpJson, settings, envVars, claudeDir, false, name);
        settings = s;
        for (const serverName of added) {
          registeredThisRun.add(serverName);
          log(`  MCP server "${serverName}" activated (wrapper at .claude/mcp/${serverName}.js)`);
        }
        for (const { name: serverName, missing } of skipped) {
          warn(`MCP server "${serverName}" skipped — missing: ${missing.join(', ')}. Add to .env and re-run /explore.`);
        }
        for (const { name: serverName, vars } of warnEnv) {
          warn(`MCP server "${serverName}" needs ${vars.join(', ')} in environment before it can start.`);
        }
      } else {
        log(`  [dry-run] Would merge MCP servers from profiles/${name}/mcp.json`);
      }
    }
  }

  if (!DRY_RUN) {
    if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
    if (Object.keys(settings).length > 0) writeSettings(settingsPath, settings);
  }
}

// ─── Uninstall ────────────────────────────────────────────────────────────────

function uninstallProfiles(forgeRoot, projectPath) {
  const claudeDir = path.join(projectPath, '.claude');
  const rulesDir = path.join(claudeDir, 'rules.local');
  const settingsPath = path.join(claudeDir, 'settings.local.json');

  if (DRY_RUN) {
    log('\n[dry-run] Would remove all profile symlinks from project.');
    pruneProfileSymlinks(rulesDir, path.join(forgeRoot, 'profiles'), [], true);
  } else {
    log('\nRemoving all profile symlinks from project...');
    pruneProfileSymlinks(rulesDir, path.join(forgeRoot, 'profiles'), []);
  }

  if (fs.existsSync(settingsPath)) {
    let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    // Enumerate MCP servers to remove (read-only — safe in dry-run)
    const allProfiles = getAvailableProfiles(forgeRoot);
    const mcpServerNames = [];
    for (const pName of allProfiles) {
      const mcpPath = path.join(forgeRoot, 'profiles', pName, 'mcp.json');
      if (fs.existsSync(mcpPath)) {
        try { mcpServerNames.push(...collectMcpServerNames(JSON.parse(fs.readFileSync(mcpPath, 'utf8')), settings, pName)); } catch {}
      }
    }

    if (DRY_RUN) {
      log('[dry-run] Would strip forge.* hooks from .claude/settings.local.json');
      if (mcpServerNames.length > 0) log(`[dry-run] Would remove MCP servers: ${mcpServerNames.join(', ')}`);
      log('[dry-run] Would write (or delete if empty) .claude/settings.local.json');
    } else {
      settings = removeForgeHooksFromSettings(settings, 'forge.');
      if (mcpServerNames.length > 0) settings = removeMcpServersFromSettings(settings, mcpServerNames, claudeDir);

      if (Object.keys(settings).length === 0) {
        fs.unlinkSync(settingsPath);
        ok('.claude/settings.local.json removed (empty)');
      } else {
        writeSettings(settingsPath, settings);
        ok('.claude/settings.local.json: forge hooks and MCP servers removed');
      }
    }
  }

  const forgeYamlPath = path.join(projectPath, '.forge.yaml');
  log(`\nNote: ${forgeYamlPath} was NOT removed — delete it manually if no longer needed.`);
  if (DRY_RUN) log('[dry-run] No changes made.');
  else ok('Project profile uninstall complete.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const forgeRoot = resolveForgeRoot();

  if (!forgeRoot) {
    err('claude-chameleon core is not installed on this machine.');
    err('Run: cd ~/claude-chameleon && ./install.sh');
    process.exit(1);
  }

  if (UNINSTALL) {
    uninstallProfiles(forgeRoot, PROJECT_PATH);
    return;
  }

  let profileNames;
  if (MANUAL_PROFILES) {
    // Validate each manually specified profile exists before proceeding.
    const available = getAvailableProfiles(forgeRoot);
    const unknown = MANUAL_PROFILES.filter(n => !available.includes(n));
    if (unknown.length > 0) {
      err(`Unknown profile(s): ${unknown.join(', ')}. Available: ${available.join(', ')}`);
      process.exit(1);
    }
    profileNames = MANUAL_PROFILES;
    log(`\nManual profile override: ${profileNames.join(', ')}\n`);
  } else {
    const detected = detectProfiles(forgeRoot, PROJECT_PATH);
    if (detected.length === 0) {
      log('No profiles detected above threshold.');
      log('To activate manually: node activate-profiles.js --project . --profiles typescript,nextjs');
      process.exit(0);
    }
    profileNames = detected.map(d => d.name);

    // Check for missing profiles that could be created
    checkForMissingProfiles(forgeRoot, PROJECT_PATH, detected);
  }
  log(`Profiles to activate: ${profileNames.join(', ')}\n`);

  const answer = YES || DRY_RUN ? 'y' : await question('Set up project profiles? [Y/n] ');

  if (answer.toLowerCase() === 'n') {
    log('\nSkipping profile setup. Running in generic mode.');
    process.exit(0);
  }

  activateProfiles(forgeRoot, profileNames, PROJECT_PATH);
  if (DRY_RUN) {
    log('\n[dry-run] No changes made.');
  } else {
    log('\n✓ Profiles activated. Machine-specific settings saved to .claude/settings.local.json (gitignored).\n');
  }
}

main().catch(e => { err(e.message); process.exit(1); });
