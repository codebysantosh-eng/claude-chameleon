'use strict';

/**
 * Shared I/O contract for all forge hooks. See HOOKS.md for the full spec.
 *
 * Three outcomes, all exit 0:
 *   allow()        neutral — emits `{}`. Does NOT auto-approve; the normal
 *                  permission flow proceeds. (Never emit decision:"approve" —
 *                  on PreToolUse that legacy-bypasses the permission prompt.)
 *   deny(reason)   block — emits both the modern hookSpecificOutput.permissionDecision
 *                  ="deny" and the legacy decision:"block" for back-compat.
 *   warn(message)  non-blocking — emits `systemMessage`, the only field Claude Code
 *                  surfaces to the user (type/message are silently dropped).
 *
 * readInput(run, opts) reads+parses stdin JSON, then calls run(input). On
 * unparseable input it fails closed (deny) when failClosed is set, else allow().
 * Pure: emit helpers build a fresh object and write it; nothing is mutated.
 */
function readInput(run, opts = {}) {
  const { failClosed = false, label = 'forge.hook', event = 'PreToolUse' } = opts;
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      if (failClosed) deny(`${label}: could not parse hook input — blocking to be safe.`, event);
      else allow();
      return;
    }
    // Backstop: an exception thrown inside run() (e.g. an unexpected tool-input shape)
    // would otherwise exit non-zero and FAIL OPEN. Catch it so blocking hooks deny instead.
    try {
      run(input);
    } catch (e) {
      if (failClosed) deny(`${label}: hook error (${e && e.message}) — blocking to be safe.`, event);
      else allow();
    }
  });
}

function allow() {
  process.stdout.write('{}\n');
  process.exit(0);
}

function deny(reason, event = 'PreToolUse') {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason,
    hookSpecificOutput: {
      hookEventName: event,
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }) + '\n');
  process.exit(0);
}

function warn(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }) + '\n');
  process.exit(0);
}

module.exports = { readInput, allow, deny, warn };
