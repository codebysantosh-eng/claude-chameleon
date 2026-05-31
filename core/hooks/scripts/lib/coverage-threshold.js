'use strict';

const { readInput, allow, warn } = require('./hook-io');

/**
 * Shared coverage-threshold warn hook.
 * Profile hooks supply a `commandMatches` predicate and reporter `patterns`;
 * this reads the Claude Code hook payload from stdin, finds a coverage percentage
 * in the test output, and emits a non-blocking warning when it falls below the target.
 *
 * Always approves (warn-only). On unreadable input it approves rather than crashing.
 *
 * @param {object}   opts
 * @param {(command: string) => boolean} opts.commandMatches  true if the command ran coverage
 * @param {RegExp[]} opts.patterns   reporter patterns; first capture group = percentage
 * @param {number}  [opts.threshold] coverage target (default 80)
 */
function runCoverageHook({ commandMatches, patterns, threshold = 80 }) {
  readInput(input => {
    const toolInput = input.tool_input || {};
    const command = toolInput.command || '';
    const response = input.tool_response || {};
    const output = response.output || response.stdout || '';

    if (input.tool_name === 'Bash' && commandMatches(command) && output) {
      for (const pattern of patterns) {
        const match = output.match(pattern);
        if (!match) continue;
        const coverage = parseFloat(match[1]);
        if (!isNaN(coverage) && coverage < threshold) {
          warn(`Coverage is ${coverage}% — below the ${threshold}% target (rules/testing.md). Run /add-tests to fill gaps.`);
        }
        break; // first matching reporter wins
      }
    }
    allow();
  }, { label: 'forge.coverage-threshold-warn' });
}

module.exports = { runCoverageHook };
