#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get the content from stdin or from the file passed as argument
const filePath = process.argv[2];
const content = filePath ? fs.readFileSync(filePath, 'utf8') : '';

// Check for hardcoded secrets patterns (basic detection)
const patterns = [
  { pattern: /'(password|secret|token|key|api_key|private_key)'\s*=>\s*'[^']+'/gi, message: 'Hardcoded secret detected' },
  { pattern: /password\s*=\s*['"][^'"]{8,}['"]/, message: 'Possible hardcoded password' },
  { pattern: /token\s*=\s*['"]sk_[a-z0-9]+['"]/, message: 'Possible hardcoded API key' },
  { pattern: /DATABASE_URL\s*=\s*['"].*:.*@/i, message: 'Database credentials may be hardcoded' }
];

let hasWarnings = false;

patterns.forEach(({ pattern, message }) => {
  if (pattern.test(content)) {
    console.warn(`⚠️  Laravel: ${message} — use env() helper or .env file instead`);
    hasWarnings = true;
  }
});

if (hasWarnings) {
  process.exit(1);
}
