#!/usr/bin/env node
/**
 * forge.python-fastapi.coverage-threshold-warn
 * Warns when pytest coverage is below 80%.
 */
const { runCoverageHook } = require('../../../core/hooks/scripts/lib/coverage-threshold');

runCoverageHook({
  commandMatches: cmd => cmd.includes('pytest') && cmd.includes('cov'),
  patterns: [/TOTAL\s+\d+\s+\d+\s+(\d+)%/],
});
