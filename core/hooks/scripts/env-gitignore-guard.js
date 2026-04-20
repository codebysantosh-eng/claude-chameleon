#!/usr/bin/env node
/**
 * forge.core.env-gitignore-guard
 * Warns when a .env file is created without a corresponding .gitignore entry.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const fs = require('fs');
const path = require('path');

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';

if (tool === 'Write' && filePath && path.basename(filePath).startsWith('.env')) {
  const dir = path.dirname(filePath);
  const gitignorePath = path.join(dir, '.gitignore');

  let gitignoreContent = '';
  try {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  } catch {
    // .gitignore doesn't exist
  }

  const envBase = path.basename(filePath);
  if (!gitignoreContent.includes(envBase) && !gitignoreContent.includes('.env')) {
    console.log(JSON.stringify({
      type: 'warning',
      message: `${filePath} created but not found in .gitignore. Add it now to prevent accidental secret exposure:\n  echo "${envBase}" >> ${gitignorePath}`
    }));
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
