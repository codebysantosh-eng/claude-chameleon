#!/usr/bin/env node
/**
 * forge.typescript.coverage-threshold-warn
 * Warns when test coverage output shows less than 80% coverage.
 */
const { runCoverageHook } = require('../../../core/hooks/scripts/lib/coverage-threshold');

runCoverageHook({
  commandMatches: cmd => cmd.includes('vitest') || cmd.includes('jest') || cmd.includes('coverage'),
  patterns: [
    /All files\s*\|[\s\d.|]+?([\d.]+)\s*\|/,  // Vitest/Jest table (statements col)
    /Statements\s*:\s*([\d.]+)%/,               // Istanbul text summary
    /Lines\s*:\s*([\d.]+)%/,                    // Istanbul lines
    /coverage:\s*([\d.]+)%/i,                   // Generic coverage line
  ],
});
