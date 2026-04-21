#!/usr/bin/env node
/**
 * forge.core.env-gitignore-guard
 * Warns when a .env file is created without a corresponding .gitignore entry.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {
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
  // Parse gitignore line-by-line; ignore negated patterns (e.g. !.env.example) and comments
  const lines = gitignoreContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const protects = p => lines.some(l =>
    !l.startsWith('!') && (l === p || l === `/${p}` || l === '.env' || l === '/.env' || l === '.env*' || l === '*.env')
  );
  if (!protects(envBase)) {
    // Combine warning + approve into one JSON object — hook runner expects exactly one output.
    console.log(JSON.stringify({
      decision: 'approve',
      type: 'warning',
      message: `${filePath} created but not found in .gitignore. Add it now to prevent accidental secret exposure:\n  echo "${envBase}" >> ${gitignorePath}`
    }));
    return;
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
