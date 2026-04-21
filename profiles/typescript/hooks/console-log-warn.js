#!/usr/bin/env node
/**
 * forge.typescript.console-log-warn
 * Warns when console.log is written to non-test TypeScript files.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';
// Write uses `content`; Edit uses `new_string` (only the inserted text — avoids flagging unchanged code).
let content = '';
if (tool === 'Write') content = toolInput.content || '';
else if (tool === 'Edit') content = toolInput.new_string || '';

const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath);
const isTsFile = /\.(ts|tsx)$/.test(filePath);

if ((tool === 'Write' || tool === 'Edit') && isTsFile && !isTestFile) {
  if (content.includes('console.log') || content.includes('console.error') || content.includes('console.warn')) {
    console.log(JSON.stringify({
      decision: 'approve',
      type: 'warning',
      message: `console.log detected in ${filePath}. Use a structured logger (Pino/Winston) instead. See profile skills/SKILL.md#observability.`
    }));
    return;
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
