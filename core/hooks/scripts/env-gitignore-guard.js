#!/usr/bin/env node
/**
 * forge.core.env-gitignore-guard
 * Warns when a .env file is created without a corresponding .gitignore entry.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Warn-only hook: on unreadable input, approve (do not block writes for a non-security warning).
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
  }
  run(input);
});

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
  // Parse gitignore line-by-line; ignore negated patterns (e.g. !.env.example) and comments.
  const lines = gitignoreContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  // Apply gitignore-style matching against the basename. A bare `.env` line matches ONLY
  // a file named exactly `.env` — it does NOT cover `.env.local`/`.env.production`.
  // Glob patterns (`.env*`, `.env.*`, `*.env`) are expanded; a leading `/` anchor is stripped
  // for the basename comparison.
  const matches = (pattern, name) => {
    if (pattern.startsWith('!')) return false;
    const p = pattern.replace(/^\//, '');
    if (!p.includes('*')) return p === name;
    try {
      const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return re.test(name);
    } catch {
      // Unconvertible glob — fall back to treating it as non-matching (warns, the safe side).
      return false;
    }
  };
  const protects = name => lines.some(l => matches(l, name));
  if (!protects(envBase)) {
    // `systemMessage` is the field Claude Code surfaces to the user; `type`/`message` are
    // non-standard and silently dropped. Keep `decision` so existing flow is unchanged.
    console.log(JSON.stringify({
      decision: 'approve',
      systemMessage: `⚠ ${filePath} created but not found in .gitignore. Add it now to prevent accidental secret exposure:\n  echo "${envBase}" >> ${gitignorePath}`
    }));
    return;
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
