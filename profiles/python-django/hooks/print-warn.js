#!/usr/bin/env node
/**
 * forge.python-django.print-warn
 * Warns when print() is written to Python source files (not tests).
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';
let content = '';
if (tool === 'Write') content = toolInput.content || '';
else if (tool === 'Edit') content = toolInput.new_string || '';

const isTestFile = /test_.*\.py$|.*_test\.py$|conftest\.py$/.test(filePath);
const isPyFile = filePath.endsWith('.py');

if ((tool === 'Write' || tool === 'Edit') && isPyFile && !isTestFile) {
  const matches = (content.match(/\bprint\s*\(/g) || []).length;
  if (matches > 0) {
    console.log(JSON.stringify({
      decision: 'approve',
      type: 'warning',
      message: `${matches} print() call(s) in ${filePath}. Use structlog or loguru instead. See profile skills/SKILL.md#logging.`
    }));
    return;
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
