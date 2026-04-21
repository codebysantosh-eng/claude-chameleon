#!/usr/bin/env node
/**
 * forge.php-symfony.var-dump-warn
 * Warns when var_dump() or dd() is written to PHP source files.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';
let content = '';
if (tool === 'Write') content = toolInput.content || '';
else if (tool === 'Edit') content = toolInput.new_string || '';

const isTestFile = /Test\.php$|test\.php$/.test(filePath);
const isPhpFile = filePath.endsWith('.php');

if ((tool === 'Write' || tool === 'Edit') && isPhpFile && !isTestFile) {
  const varDumps = (content.match(/\bvar_dump\s*\(/g) || []).length;
  const dds = (content.match(/\bdd\s*\(/g) || []).length;

  const messages = [];
  if (varDumps > 0) {
    messages.push(`${varDumps} var_dump() call(s) in ${filePath}. Use Monolog logger instead. See profile skills/SKILL.md#logging.`);
  }
  if (dds > 0) {
    messages.push(`${dds} dd() call(s) in ${filePath}. Remove before committing — this halts execution in production.`);
  }

  if (messages.length > 0) {
    console.log(JSON.stringify({
      decision: 'approve',
      type: 'warning',
      message: messages.join('\n')
    }));
    return;
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
