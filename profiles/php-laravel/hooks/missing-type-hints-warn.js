#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get the content from stdin or from the file passed as argument
const filePath = process.argv[2];
const content = filePath ? fs.readFileSync(filePath, 'utf8') : '';

// Skip if this is a test file or migration (they often have lenient typing)
if (filePath && (filePath.includes('tests/') || filePath.includes('database/migrations/'))) {
  process.exit(0);
}

// Check for function parameters without type hints
// This is a basic check; may have false positives
const functionPattern = /public\s+function\s+\w+\s*\(\s*\$\w+(?!\s*:)/;

let hasWarnings = false;

// Only warn if we see multiple untyped parameters
const lines = content.split('\n');
let untypedCount = 0;

lines.forEach((line, idx) => {
  // Look for public methods with untyped parameters
  if (line.match(/public\s+function\s+\w+/)) {
    const nextPart = content.substring(content.indexOf(line));
    // Check if the parameters section has untyped $variables
    const paramsMatch = nextPart.match(/\(([^)]+)\)/);
    if (paramsMatch) {
      const params = paramsMatch[1];
      // Count parameters without type hints (simple heuristic: $ not preceded by :)
      const untypedMatches = params.match(/(?<!:)\s+\$/g);
      if (untypedMatches && untypedMatches.length > 0) {
        untypedCount++;
      }
    }
  }
});

if (untypedCount > 0) {
  console.warn(`⚠️  Laravel: ${untypedCount} public method(s) have untyped parameters — add type hints for PHP 8.4 compatibility`);
  hasWarnings = true;
}

if (hasWarnings) {
  process.exit(1);
}
