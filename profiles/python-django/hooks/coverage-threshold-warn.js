#!/usr/bin/env node
/**
 * forge.python-django.coverage-threshold-warn
 * Warns when pytest coverage is below 80%.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const command = toolInput.command || '';
const output = input.tool_result?.output || '';

const isPytestCoverage = tool === 'Bash' && (command.includes('pytest') && command.includes('cov'));

if (isPytestCoverage && output) {
  const match = output.match(/TOTAL\s+\d+\s+\d+\s+(\d+)%/);
  if (match) {
    const coverage = parseInt(match[1], 10);
    if (coverage < 80) {
      console.log(JSON.stringify({
        type: 'warning',
        message: `Coverage is ${coverage}% — below the 80% target (rules/testing.md). Run /add-tests to fill gaps.`
      }));
    }
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
