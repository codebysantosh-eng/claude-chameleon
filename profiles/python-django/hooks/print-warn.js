#!/usr/bin/env node
/**
 * forge.python-django.print-warn
 * Warns when print() is written to Python source files (not tests).
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';
const content = toolInput.content || '';

const isTestFile = /test_.*\.py$|.*_test\.py$|conftest\.py$/.test(filePath);
const isPyFile = filePath.endsWith('.py');

if ((tool === 'Write' || tool === 'Edit') && isPyFile && !isTestFile) {
  const matches = (content.match(/\bprint\s*\(/g) || []).length;
  if (matches > 0) {
    console.log(JSON.stringify({
      type: 'warning',
      message: `${matches} print() call(s) in ${filePath}. Use structlog or loguru instead. See profile skills/SKILL.md#logging.`
    }));
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
