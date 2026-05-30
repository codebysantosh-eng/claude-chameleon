#!/usr/bin/env node
/**
 * forge.core.block-hook-bypass
 * Blocks --no-verify and --no-gpg-sign flags that bypass safety checks.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Fail closed: a guard that can't read its input must not silently let a bypass through.
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'forge.core.block-hook-bypass: could not parse hook input — blocking to be safe. Re-run; if this persists, check the hook installation.'
    }));
    process.exit(0);
  }
  run(input);
});

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
// Disabling gpg signing or all hooks via -c config overrides.
if (/-c\s+commit\.gpgsign=false/.test(command)) found.push('-c commit.gpgsign=false');
if (/core\.hooksPath\s*=/.test(command)) found.push('core.hooksPath override');

if (tool === 'Bash' && isGitCommand && found.length > 0) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: `Hook bypass blocked: ${found.join(', ')} detected. Safety hooks exist for a reason. Remove the flag and fix the underlying issue.`
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: 'approve' }));
}
