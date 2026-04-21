#!/usr/bin/env node
/**
 * forge.php-laravel.no-dd-warn
 * Warns when dd(), dump(), or var_dump() is written to PHP source files.
 * Excludes test files and skips Laravel Collection::dump() method calls.
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

  // Skip test files and migrations where debug output is more acceptable
  const isTestFile = /Test\.php$|test\.php$|\.test\.php$/.test(filePath);
  const isMigration = /database\/migrations\//.test(filePath);
  const isPhpFile = filePath.endsWith('.php');

  if ((tool === 'Write' || tool === 'Edit') && isPhpFile && !isTestFile && !isMigration) {
    const messages = [];

    // Count dd() calls (free-standing function)
    const dds = (content.match(/\bdd\s*\(/g) || []).length;
    if (dds > 0) {
      messages.push(`dd() called ${dds} time(s). Remove before committing — halts execution in production.`);
    }

    // Count var_dump() calls (free-standing function)
    const varDumps = (content.match(/\bvar_dump\s*\(/g) || []).length;
    if (varDumps > 0) {
      messages.push(`var_dump() called ${varDumps} time(s). Use structured logging via Log facade instead.`);
    }

    // Count dump() calls but exclude method calls (->dump) and static calls (::dump)
    // Pattern: dump not preceded by -> or ::, followed by (
    const dumpMatches = content.match(/(^|[^>:$\w])dump\s*\(/gm) || [];
    const dumps = dumpMatches.length;
    if (dumps > 0) {
      messages.push(`dump() called ${dumps} time(s). Use Log facade or dd() for interactive debugging only.`);
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
