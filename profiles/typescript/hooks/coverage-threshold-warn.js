#!/usr/bin/env node
/**
 * forge.typescript.coverage-threshold-warn
 * Warns when test coverage output shows less than 80% coverage.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const command = toolInput.command || '';
const output = input.tool_result?.output || '';

const isTestCommand = tool === 'Bash' && (
  command.includes('vitest') || command.includes('jest') || command.includes('coverage')
);

if (isTestCommand && output) {
  const match = output.match(/All files\s*\|\s*([\d.]+)/);
  if (match) {
    const coverage = parseFloat(match[1]);
    if (coverage < 80) {
      console.log(JSON.stringify({
        type: 'warning',
        message: `Coverage is ${coverage}% — below the 80% target (rules/testing.md). Run /add-tests to fill gaps.`
      }));
    }
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
