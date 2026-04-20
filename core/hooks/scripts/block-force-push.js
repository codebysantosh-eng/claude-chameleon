#!/usr/bin/env node
/**
 * forge.core.block-force-push
 * Blocks git push --force on shared branches. Suggests --force-with-lease.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const command = toolInput.command || '';

const isGitPush = tool === 'Bash' && command.includes('git push');
const hasForce = command.includes(' --force') || command.includes(' -f ') || command.includes(' -f\n') || command.endsWith(' -f');
const hasForceWithLease = command.includes('--force-with-lease');

if (isGitPush && hasForce && !hasForceWithLease) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: 'git push --force blocked. Use --force-with-lease to avoid overwriting others\' work. Exception: force-pushing to remove a committed secret is the only justified use case — confirm with the user first.'
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: 'approve' }));
