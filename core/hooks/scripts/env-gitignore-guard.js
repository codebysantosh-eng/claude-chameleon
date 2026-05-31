#!/usr/bin/env node
/**
 * forge.core.env-gitignore-guard
 * Warns when a .env file is created without a corresponding .gitignore entry.
 */
const fs = require('fs');
const path = require('path');
const { readInput, allow, warn } = require('./lib/hook-io');

readInput(run, { label: 'forge.core.env-gitignore-guard' });

function run(input) {
  const tool = input.tool_name;
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || '';

  if (tool === 'Write' && filePath && path.basename(filePath).startsWith('.env')) {
    const dir = path.dirname(filePath);
    const gitignorePath = path.join(dir, '.gitignore');

    let gitignoreContent = '';
    try { gitignoreContent = fs.readFileSync(gitignorePath, 'utf8'); } catch { /* no .gitignore */ }

    const envBase = path.basename(filePath);
    // Ignore negated patterns and comments.
    const lines = gitignoreContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    // gitignore-style basename match. A bare `.env` line matches ONLY a file named exactly
    // `.env` — NOT `.env.local`. Globs (`.env*`, `.env.*`, `*.env`) are expanded.
    const matches = (pattern, name) => {
      if (pattern.startsWith('!')) return false;
      const p = pattern.replace(/^\//, '');
      if (!p.includes('*')) return p === name;
      try {
        const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*') + '$');
        return re.test(name);
      } catch {
        return false; // unconvertible glob -> treat as non-matching (warns, the safe side)
      }
    };
    const protects = name => lines.some(l => matches(l, name));

    if (!protects(envBase)) {
      warn(`${filePath} created but not found in .gitignore. Add it now to prevent accidental secret exposure:\n  echo "${envBase}" >> ${gitignorePath}`);
    }
  }
  allow();
}
