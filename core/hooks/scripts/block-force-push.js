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

  // Match `git push` only as the COMMAND being run: at the start of a segment (after `;`,
  // `&&`, `||`, `|`, `(`, or a newline — all covered by the char class), optionally preceded
  // by env-var assignments and `sudo`. This is what stops a force-push string that merely
  // appears INSIDE another command's argument from firing — e.g. `grep "git push --force"`,
  // a doc `echo "git push --force"`, or `git commit -m "...git push --force..."`. Global
  // options between `git` and `push` (`git -c key=val push`, `git --no-pager push`) are
  // tolerated; `push(?=\s|$)` requires push to be a real subcommand token, so `push` inside
  // a config key (`-c push.default=…`) is not mistaken for a push subcommand.
  const GIT_PUSH = String.raw`(?:^|[;&|(\n])\s*(?:[A-Za-z_]\w*=\S+\s+)*(?:sudo\s+)?git\s+(?:-c\s+\S+\s+|--?\S+\s+)*push(?=\s|$)`;
  const isGitPush = tool === 'Bash' && new RegExp(GIT_PUSH).test(command);
  // Scope each force check to the push command's own segment (`[^;&|\n]*` stops at separators
  // and newlines, so a later `grep -f` / next-line command isn't flagged). A flag may be
  // quote-wrapped (`git push "--force"`, `'-f'`) — the shell strips the quotes before git
  // runs — so allow an optional quote around it. `--force` is matched exactly, so
  // `--force-with-lease` (followed by `-`) stays allowed; `-[a-z]*f[a-z]*` catches short
  // clusters (`-f`, `-fq`, `-uf`) which git treats as --force.
  const hasForce = new RegExp(GIT_PUSH + String.raw`[^;&|\n]*\s["']?(?:--force(?:["']|\s|$)|-[a-z]*f[a-z]*(?:["']|\s|$))`).test(command);
  const hasRefspecForce = new RegExp(GIT_PUSH + String.raw`[^;&|\n]*\s["']?\+[\w./:-]+(?:["']|\s|$)`).test(command);
  // git treats push.force as a boolean: true/1/yes/on (any case) all enable force.
  // Matching only `=true` let `git -c push.force=1 push` (and =yes/=on/=TRUE) slip through.
  const hasConfigForce = /(?:^|[;&|(\n])\s*(?:[A-Za-z_]\w*=\S+\s+)*(?:sudo\s+)?git\s+(?:[^;&|\n]*\s)?-c\s+push\.force=(?:true|1|yes|on)\b/i.test(command);

  // No `--force-with-lease` exemption: a bare `--force`/`-f` is dangerous even when a
  // lease flag is also present (the bare flag wins), and a pure `--force-with-lease`
  // push never trips hasForce above, so it is already allowed without a special case.
  if (isGitPush && (hasForce || hasRefspecForce || hasConfigForce)) {
    deny("git push --force blocked. Use --force-with-lease to avoid overwriting others' work. Exception: force-pushing to remove a committed secret is the only justified use case — confirm with the user first.");
  }
  allow();
}
