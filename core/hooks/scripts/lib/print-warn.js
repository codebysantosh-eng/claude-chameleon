'use strict';

const { readInput, allow, warn } = require('./hook-io');

/**
 * Shared print()-in-Python warn hook. Profiles supply the recommended logger(s).
 * Skips test files; counts print( calls in written/edited Python source.
 */
function runPrintWarn({ loggers }) {
  readInput(input => {
    const tool = input.tool_name;
    const ti = input.tool_input || {};
    const filePath = ti.file_path || '';
    const content = tool === 'Write' ? (ti.content || '') : tool === 'Edit' ? (ti.new_string || '') : '';
    const isTest = /test_.*\.py$|.*_test\.py$|conftest\.py$/.test(filePath);

    if ((tool === 'Write' || tool === 'Edit') && filePath.endsWith('.py') && !isTest && content) {
      const matches = (content.match(/\bprint\s*\(/g) || []).length;
      if (matches > 0) {
        warn(`${matches} print() call(s) in ${filePath}. Use ${loggers} instead. See profile skills/SKILL.md#logging.`);
      }
    }
    allow();
  }, { label: 'forge.print-warn' });
}

module.exports = { runPrintWarn };
