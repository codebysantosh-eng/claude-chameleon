#!/usr/bin/env node
/**
 * forge.core.large-file-warn
 * Warns when a file written exceeds 800 lines.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const fs = require('fs');
const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';

let lineCount = null;

if (tool === 'Write' && toolInput.content) {
  lineCount = toolInput.content.split('\n').length;
} else if (tool === 'Edit' && filePath) {
  // Edit doesn't pass full content — read the file on disk after the edit
  try {
    lineCount = fs.readFileSync(filePath, 'utf8').split('\n').length;
  } catch { /* file may not exist yet */ }
}

if (lineCount !== null && lineCount > 800) {
  console.log(JSON.stringify({
    decision: 'approve',
    type: 'warning',
    message: `${filePath} is ${lineCount} lines (limit: 800). Consider splitting into smaller modules.`
  }));
  return;
}

console.log(JSON.stringify({ decision: 'approve' }));
}
