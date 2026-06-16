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

  // Recognise `git push` even with global options between `git` and `push`
  // (`git -c key=val push -f`, `git --no-pager push -f`) — matching the bypass hook.
  const isGitPush = tool === 'Bash' && /\bgit\s+(?:-c\s+\S+\s+|--?\S+\s+)*push\b/.test(command);
  // Scope the force check to the push command's own line/segment so an unrelated `-f`
  // (e.g. `git push origin main && grep -f patterns`, or a `grep -f` on the next line of a
  // multi-line script) is not flagged — hence `[^;&|\n]*`, which stops at separators AND
  // newlines. Force is either long `--force` (exact, so `--force-with-lease` stays allowed:
  // it is followed by `-`, not whitespace/end) OR a short-flag cluster containing `f`
  // (`-f`, `-fq`, `-uf`, …), which git treats as --force.
  const hasForce = /\bgit\s+(?:-c\s+\S+\s+|--?\S+\s+)*push\b[^;&|\n]*\s(?:--force(\s|$)|-[a-z]*f[a-z]*(\s|$))/.test(command);
  const hasRefspecForce = /\bgit\s+(?:-c\s+\S+\s+|--?\S+\s+)*push\b[^;&|\n]*\s\+[\w./:-]+(\s|$)/.test(command);
  const hasConfigForce = /\bgit\s+(?:[^;&|\n]*\s)?-c\s+push\.force=true\b/.test(command);

  // No `--force-with-lease` exemption: a bare `--force`/`-f` is dangerous even when a
  // lease flag is also present (the bare flag wins), and a pure `--force-with-lease`
  // push never trips hasForce above, so it is already allowed without a special case.
  if (isGitPush && (hasForce || hasRefspecForce || hasConfigForce)) {
    deny("git push --force blocked. Use --force-with-lease to avoid overwriting others' work. Exception: force-pushing to remove a committed secret is the only justified use case — confirm with the user first.");
  }
  allow();
}
