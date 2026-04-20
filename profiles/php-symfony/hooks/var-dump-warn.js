#!/usr/bin/env node
/**
 * forge.php-symfony.var-dump-warn
 * Warns when var_dump() or dd() is written to PHP source files.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';
const content = toolInput.content || '';

const isTestFile = /Test\.php$|test\.php$/.test(filePath);
const isPhpFile = filePath.endsWith('.php');

if ((tool === 'Write' || tool === 'Edit') && isPhpFile && !isTestFile) {
  const varDumps = (content.match(/\bvar_dump\s*\(/g) || []).length;
  const dds = (content.match(/\bdd\s*\(/g) || []).length;

  if (varDumps > 0) {
    console.log(JSON.stringify({
      type: 'warning',
      message: `${varDumps} var_dump() call(s) in ${filePath}. Use Monolog logger instead. See profile skills/SKILL.md#logging.`
    }));
  }
  if (dds > 0) {
    console.log(JSON.stringify({
      type: 'warning',
      message: `${dds} dd() call(s) in ${filePath}. Remove before committing — this halts execution in production.`
    }));
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
