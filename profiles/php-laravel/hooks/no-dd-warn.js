#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get the content from stdin or from the file passed as argument
const filePath = process.argv[2];
const content = filePath ? fs.readFileSync(filePath, 'utf8') : '';

// Check for dd(), dump(), var_dump()
const patterns = [
  { pattern: /\bdd\s*\(/, message: 'dd() found — use structured logging instead' },
  { pattern: /\bdump\s*\(/, message: 'dump() found — use structured logging instead' },
  { pattern: /\bvar_dump\s*\(/, message: 'var_dump() found — use structured logging instead' }
];

let hasWarnings = false;

patterns.forEach(({ pattern, message }) => {
  if (pattern.test(content)) {
    console.warn(`⚠️  Laravel: ${message}`);
    hasWarnings = true;
  }
});

if (hasWarnings) {
  process.exit(1);
}
