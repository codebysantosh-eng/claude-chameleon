'use strict';

const fs = require('fs');

function loadSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    process.stderr.write(`⚠ Could not parse ${settingsPath} — creating fresh\n`);
    return {};
  }
}

// Second arg is now a settings object (not a file path) so callers can accumulate
// merges across multiple profiles without re-reading from disk each time.
function mergeHooksIntoSettings(hooksJson, settings, forgeRoot) {
  if (!settings || typeof settings !== 'object') settings = {};
  if (!settings.hooks) settings.hooks = {};

  const incoming = hooksJson.hooks || {};
  for (const phase of Object.keys(incoming)) {
    if (!incoming[phase]) continue;
    if (!settings.hooks[phase]) settings.hooks[phase] = [];

    for (const entry of incoming[phase]) {
      for (const hook of entry.hooks || []) {
        // Idempotent: remove existing hook with same ID before re-adding
        settings.hooks[phase] = settings.hooks[phase].filter(
          existingEntry => !(existingEntry.hooks || []).some(h => h.id === hook.id)
        );
        const resolvedHook = {
          ...hook,
          command: hook.command.replace(/\{\{FORGE_ROOT\}\}/g, forgeRoot),
        };
        settings.hooks[phase].push({ hooks: [resolvedHook], matcher: entry.matcher });
      }
    }
  }

  return settings;
}

function removeForgeHooksFromSettings(settings, prefix) {
  const hooks = settings.hooks || {};
  for (const phase of Object.keys(hooks)) {
    if (!hooks[phase]) continue;
    hooks[phase] = hooks[phase]
      .map(entry => ({
        ...entry,
        hooks: (entry.hooks || []).filter(h => !h.id || !h.id.startsWith(prefix)),
      }))
      .filter(entry => (entry.hooks || []).length > 0);
    if (hooks[phase].length === 0) delete hooks[phase];
  }
  return settings;
}

// Atomic write: write to tmp then rename to avoid corruption on kill
function writeSettings(settingsPath, settings) {
  // Keep one backup of the pre-activation state (created on first write only)
  const bak = settingsPath + '.bak';
  if (fs.existsSync(settingsPath) && !fs.existsSync(bak)) {
    fs.copyFileSync(settingsPath, bak);
  }
  const tmp = settingsPath + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, JSON.stringify(settings, null, 2));
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmp, settingsPath);
}

module.exports = { mergeHooksIntoSettings, removeForgeHooksFromSettings, writeSettings, loadSettings };
