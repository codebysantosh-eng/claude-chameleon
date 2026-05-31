#!/usr/bin/env node
/**
 * forge.core.block-force-push
 * Blocks git push --force on shared branches. Suggests --force-with-lease.
 */
const { readInput, allow, deny } = require('./lib/hook-io');

readInput(run, { failClosed: true, label: 'forge.core.block-force-push' });

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
    deny("git push --force blocked. Use --force-with-lease to avoid overwriting others' work. Exception: force-pushing to remove a committed secret is the only justified use case — confirm with the user first.");
  }
  allow();
}
