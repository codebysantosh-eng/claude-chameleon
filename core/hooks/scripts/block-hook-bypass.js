#!/usr/bin/env node
/**
 * forge.core.block-hook-bypass
 * Blocks --no-verify and --no-gpg-sign flags that bypass safety checks.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const command = toolInput.command || '';

const isGitCommand = /\bgit\s+(commit|push|rebase|merge)\b/.test(command);
const bypassFlags = ['--no-verify', '--no-gpg-sign', '-c commit.gpgsign=false'];
const found = bypassFlags.filter(flag => command.includes(flag));

if (tool === 'Bash' && isGitCommand && found.length > 0) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: `Hook bypass blocked: ${found.join(', ')} detected. Safety hooks exist for a reason. Remove the flag and fix the underlying issue.`
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: 'approve' }));
}
