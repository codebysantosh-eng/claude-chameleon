#!/usr/bin/env node
/**
 * forge.core.block-force-push
 * Blocks git push --force on shared branches. Suggests --force-with-lease.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Fail closed: a guard that can't read its input must not silently let the push through.
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'forge.core.block-force-push: could not parse hook input — blocking to be safe. Re-run; if this persists, check the hook installation.'
    }));
    process.exit(0);
  }
  run(input);
});

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const command = toolInput.command || '';

const isGitPush = tool === 'Bash' && /\bgit\s+push\b/.test(command);
// Scope the --force / -f check to the push segment so an unrelated `-f` in a
// chained command (e.g. `git push origin main && grep -f patterns`) is not flagged.
const hasForce = /\bgit\s+push\b[^;&|]*\s(--force|-f)(\s|$)/.test(command);
const hasRefspecForce = /\bgit\s+push\b[^;&|]*\s\+[\w./:-]+(\s|$)/.test(command);
const hasConfigForce = /\bgit\s+-c\s+push\.force=true\b/.test(command);
const hasForceWithLease = command.includes('--force-with-lease');

if (isGitPush && (hasForce || hasRefspecForce || hasConfigForce) && !hasForceWithLease) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: 'git push --force blocked. Use --force-with-lease to avoid overwriting others\' work. Exception: force-pushing to remove a committed secret is the only justified use case — confirm with the user first.'
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: 'approve' }));
}
