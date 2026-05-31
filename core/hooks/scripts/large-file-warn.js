#!/usr/bin/env node
/**
 * forge.core.large-file-warn
 * Warns when a file written exceeds 800 lines.
 */
const fs = require('fs');
const { readInput, allow, warn } = require('./lib/hook-io');

readInput(run, { label: 'forge.core.large-file-warn' });

function run(input) {
  const tool = input.tool_name;
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || '';

  let lineCount = null;
  if (tool === 'Write' && toolInput.content) {
    lineCount = toolInput.content.split('\n').length;
  } else if (tool === 'Edit' && filePath) {
    // Edit doesn't pass full content — read the file on disk after the edit.
    try { lineCount = fs.readFileSync(filePath, 'utf8').split('\n').length; } catch { /* may not exist */ }
  }

  if (lineCount !== null && lineCount > 800) {
    warn(`${filePath} is ${lineCount} lines (limit: 800). Consider splitting into smaller modules.`);
  }
  allow();
}
