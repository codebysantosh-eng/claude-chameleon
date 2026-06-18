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

// Shell-quote a substituted path so spaces (and other metacharacters) survive the
// stripped, non-interactive shell Claude runs hooks under. Without this, an interpreter
// path like `/Users/x/Library/Application Support/.../node` (Herd/nvm on macOS) splits on
// the space and dies with `sh: /Users/.../Application: No such file or directory` (exit 127).
// Mirrors POSIX `shlex.quote`: leave already-safe tokens untouched (keeps output readable
// and CI paths unchanged), single-quote everything else, escaping embedded single quotes.
function shellQuote(value) {
  const str = String(value);
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(str)) return str;
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

// Resolve a hook command's templated tokens to absolute paths. The interpreter is
// injected here — not trusted to PATH — because Claude runs hooks in a stripped,
// non-interactive shell that never sources nvm/fnm/volta/asdf. `nodePath` defaults to
// process.execPath: the exact node that ran the installer, which is the node the user has.
// Substituted values are shell-quoted (see shellQuote) so paths with spaces stay intact.
// The trailing bare-`node ` rewrite bulletproofs legacy/third-party hooks.json authored
// before the {{NODE}} token existed, so this PATH-dependency bug class cannot recur.
function resolveHookCommand(command, forgeRoot, nodePath) {
  const withNode = command.replace(/\{\{NODE\}\}/g, () => shellQuote(nodePath));
  const withRoot = withNode.replace(/\{\{FORGE_ROOT\}\}/g, () => shellQuote(forgeRoot));
  return withRoot.replace(/^node(?=\s)/, () => shellQuote(nodePath));
}

// Second arg is now a settings object (not a file path) so callers can accumulate
// merges across multiple profiles without re-reading from disk each time.
// Third arg is an options object { forgeRoot, nodePath }; a bare string is accepted as
// forgeRoot for back-compat. Pure: returns a new settings object; never mutates the input
// (per the kit's immutability rule).
function mergeHooksIntoSettings(hooksJson, settings, options) {
  const opts = typeof options === 'string' ? { forgeRoot: options } : (options || {});
  const forgeRoot = opts.forgeRoot;
  const nodePath = opts.nodePath || process.execPath;
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
        const resolvedHook = { ...hook, command: resolveHookCommand(hook.command, forgeRoot, nodePath) };
        entries = [...entries, { hooks: [resolvedHook], matcher: entry.matcher }];
      }
    }
    hooks[phase] = entries;
  }

  return { ...base, hooks };
}

// Pure removal. Matches a forge hook by ID prefix OR — for legacy entries written before
// IDs existed — by command path pointing into the kit's hook scripts. Returns new settings.
function removeForgeHooksFromSettings(settings, prefix, forgeRoot) {
  if (!settings || !settings.hooks) return settings;
  const isForge = h => {
    if (h.id && h.id.startsWith(prefix)) return true;
    // Legacy id-less hooks (written before IDs existed) are matched by command path — but
    // ONLY when the path points into THIS kit install (forgeRoot). Without forgeRoot we
    // cannot distinguish a forge hook from a user's own hook whose path merely contains
    // these segments (e.g. ~/myproj/profiles/x/hooks/mine.js), so we do NOT path-match.
    const cmd = h.command || '';
    // Require a path boundary after forgeRoot so a superstring sibling dir
    // (forgeRoot `/opt/cc` vs a user's `/opt/cc-evil/...`) cannot match.
    const fr = forgeRoot ? String(forgeRoot).replace(/[/\\]+$/, '') : '';
    return !!fr && cmd.includes(fr + '/') &&
      /\/(core\/hooks\/scripts|profiles\/[^/]+\/hooks)\//.test(cmd);
  };

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
