#!/usr/bin/env node
/**
 * forge.typescript.coverage-threshold-warn
 * Warns when test coverage output shows less than 80% coverage.
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

const isTestCommand = tool === 'Bash' && (
  command.includes('vitest') || command.includes('jest') || command.includes('coverage')
);

if (isTestCommand && output) {
  // Try multiple reporter formats: Vitest/Jest table, Istanbul text, percentage summary
  const patterns = [
    /All files\s*\|[\s\d.|]+?([\d.]+)\s*\|/,  // Vitest/Jest table (statements col)
    /Statements\s*:\s*([\d.]+)%/,               // Istanbul text summary
    /Lines\s*:\s*([\d.]+)%/,                    // Istanbul lines
    /coverage:\s*([\d.]+)%/i,                   // Generic coverage line
  ];

  let coverage = null;
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) { coverage = parseFloat(match[1]); break; }
  }

  if (coverage !== null && coverage < 80) {
    console.log(JSON.stringify({
      decision: 'approve',
      type: 'warning',
      message: `Coverage is ${coverage}% — below the 80% target (rules/testing.md). Run /add-tests to fill gaps.`
    }));
    return;
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
