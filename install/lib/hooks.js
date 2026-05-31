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
// Pure: returns a new settings object; never mutates the input (per the kit's immutability rule).
function mergeHooksIntoSettings(hooksJson, settings, forgeRoot) {
  const base = settings && typeof settings === 'object' ? settings : {};
  const hooks = { ...(base.hooks || {}) };
  const incoming = hooksJson.hooks || {};

  for (const phase of Object.keys(incoming)) {
    if (!incoming[phase]) continue;
    let entries = [...(hooks[phase] || [])];
    for (const entry of incoming[phase]) {
      for (const hook of entry.hooks || []) {
        // Idempotent: drop any existing entry carrying the same hook ID before re-adding.
        entries = entries.filter(e => !(e.hooks || []).some(h => h.id === hook.id));
        const resolvedHook = { ...hook, command: hook.command.replace(/\{\{FORGE_ROOT\}\}/g, forgeRoot) };
        entries = [...entries, { hooks: [resolvedHook], matcher: entry.matcher }];
      }
    }
    hooks[phase] = entries;
  }

  return { ...base, hooks };
}

// Pure removal. Matches a forge hook by ID prefix OR — for legacy entries written before
// IDs existed — by command path pointing into the kit's hook scripts. Returns new settings.
function removeForgeHooksFromSettings(settings, prefix) {
  if (!settings || !settings.hooks) return settings;
  const isForge = h =>
    (h.id && h.id.startsWith(prefix)) ||
    /\/(core\/hooks\/scripts|profiles\/[^/]+\/hooks)\//.test(h.command || '');

  const newHooks = {};
  for (const phase of Object.keys(settings.hooks)) {
    const entries = (settings.hooks[phase] || [])
      .map(entry => ({ ...entry, hooks: (entry.hooks || []).filter(h => !isForge(h)) }))
      .filter(entry => (entry.hooks || []).length > 0);
    if (entries.length > 0) newHooks[phase] = entries;
  }

  const next = { ...settings };
  if (Object.keys(newHooks).length > 0) next.hooks = newHooks;
  else delete next.hooks;
  return next;
}

// Atomic write: write to tmp then rename to avoid corruption on kill.
function writeSettings(settingsPath, settings) {
  const tmp = settingsPath + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, JSON.stringify(settings, null, 2));
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmp, settingsPath);
}

// Remove a legacy `<settings>.bak` left behind by older versions (the atomic write
// above makes it unnecessary). Safe no-op if absent.
function removeLegacyBackup(settingsPath) {
  const bak = settingsPath + '.bak';
  try { if (fs.existsSync(bak)) fs.unlinkSync(bak); } catch { /* best effort */ }
}

module.exports = { mergeHooksIntoSettings, removeForgeHooksFromSettings, writeSettings, removeLegacyBackup, loadSettings };
