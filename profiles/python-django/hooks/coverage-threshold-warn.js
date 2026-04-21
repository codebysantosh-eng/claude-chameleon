#!/usr/bin/env node
/**
 * forge.python-django.coverage-threshold-warn
 * Warns when pytest coverage is below 80%.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const command = toolInput.command || '';
const response = input.tool_response || {};
const output = response.output || response.stdout || '';

const isPytestCoverage = tool === 'Bash' && (command.includes('pytest') && command.includes('cov'));

if (isPytestCoverage && output) {
  const match = output.match(/TOTAL\s+\d+\s+\d+\s+(\d+)%/);
  if (match) {
    const coverage = parseInt(match[1], 10);
    if (coverage < 80) {
      console.log(JSON.stringify({
        decision: 'approve',
        type: 'warning',
        message: `Coverage is ${coverage}% — below the 80% target (rules/testing.md). Run /add-tests to fill gaps.`
      }));
      return;
    }
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
