#!/usr/bin/env node
/**
 * forge.core.block-hook-bypass
 * Blocks flags that bypass safety checks: --no-verify (and its -n alias),
 * --no-gpg-sign, gpgsign=false, and core.hooksPath overrides.
 */
const { readInput, allow, deny } = require('./lib/hook-io');

readInput(run, { failClosed: true, label: 'forge.core.block-hook-bypass' });

function run(input) {
  const tool = input.tool_name;
  const toolInput = input.tool_input || {};
  const command = toolInput.command || '';

  // Match `git <subcommand>` allowing intervening global options like `-c key=val`
  // or `--no-pager` (so `git -c core.hooksPath=/dev/null commit` is still recognised).
  const isGitCommand = /\bgit\s+(?:-c\s+\S+\s+|--?\S+\s+)*(commit|push|rebase|merge|cherry-pick|am)\b/.test(command);
  const found = ['--no-verify', '--no-gpg-sign'].filter(flag => command.includes(flag));

  // `-n` is the short alias for `--no-verify` — but ONLY for `git commit` (for
  // `git push -n` it means --dry-run, which is harmless). Scope it to the commit
  // segment and stop at the first quote so a `-n` inside a commit message is not flagged.
  if (/\bgit\s+commit\b[^"'|;&]*\s-n(\s|$)/.test(command)) found.push('-n (--no-verify)');
  if (/-c\s+commit\.gpgsign=false/.test(command)) found.push('-c commit.gpgsign=false');
  if (/core\.hooksPath\s*=/.test(command)) found.push('core.hooksPath override');

  if (tool === 'Bash' && isGitCommand && found.length > 0) {
    deny(`Hook bypass blocked: ${found.join(', ')} detected. Safety hooks exist for a reason. Remove the flag and fix the underlying issue.`);
  }
  allow();
}
