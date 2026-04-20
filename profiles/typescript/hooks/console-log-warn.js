#!/usr/bin/env node
/**
 * forge.typescript.console-log-warn
 * Warns when console.log is written to non-test TypeScript files.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';
const content = toolInput.content || '';

const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath);
const isTsFile = /\.(ts|tsx)$/.test(filePath);

if ((tool === 'Write' || tool === 'Edit') && isTsFile && !isTestFile) {
  if (content.includes('console.log') || content.includes('console.error') || content.includes('console.warn')) {
    console.log(JSON.stringify({
      type: 'warning',
      message: `console.log detected in ${filePath}. Use a structured logger (Pino/Winston) instead. See profile skills/SKILL.md#observability.`
    }));
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
