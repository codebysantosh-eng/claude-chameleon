#!/usr/bin/env node
/**
 * forge.core.large-file-warn
 * Warns when a file written exceeds 800 lines.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';
const content = toolInput.content || '';

if ((tool === 'Write' || tool === 'Edit') && filePath && content) {
  const lineCount = content.split('\n').length;
  if (lineCount > 800) {
    console.log(JSON.stringify({
      type: 'warning',
      message: `${filePath} is ${lineCount} lines (limit: 800). Consider splitting into smaller modules.`
    }));
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
