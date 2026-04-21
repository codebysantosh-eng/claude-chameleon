#!/usr/bin/env node
/**
 * forge.core.block-force-push
 * Blocks git push --force on shared branches. Suggests --force-with-lease.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const command = toolInput.command || '';

const isGitPush = tool === 'Bash' && /\bgit\s+push\b/.test(command);
const hasForce = /\s(--force|-f)(\s|$)/.test(command);
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
