#!/usr/bin/env node
/**
 * forge.php-laravel.missing-type-hints-warn
 * Warns when public/protected methods have untyped parameters in PHP files.
 * Uses parameter-list extraction to avoid false positives in multi-line declarations.
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

  // Skip test files, factories, seeders, migrations where strict typing is less critical
  const isTestFile = /Test\.php$|test\.php$|\.test\.php$|Factory\.php$|Seeder\.php$/i.test(filePath);
  const isMigration = /database\/(migrations|seeders)\//.test(filePath);
  const isPhpFile = filePath.endsWith('.php');

  if ((tool === 'Write' || tool === 'Edit') && isPhpFile && !isTestFile && !isMigration) {
    let untypedCount = 0;

    // Extract all function declarations (including multi-line)
    // Matches: public function foo(...) or protected function bar(...) etc.
    const funcPattern = /(?:public|protected|private|static|\s)*function\s+(\w+)\s*\(([^)]*)\)/gs;
    let match;

    while ((match = funcPattern.exec(content)) !== null) {
      const funcName = match[1];
      const paramsStr = match[2];

      // Skip magic methods that often have loose typing in base classes
      if (funcName === '__call' || funcName === '__callStatic') {
        continue;
      }

      // Split parameters on commas (top-level only; we don't try to handle () inside defaults)
      const params = paramsStr
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      for (const param of params) {
        // Check if parameter is untyped
        // Typed parameters start with: type, ?, union (A|B), intersection (A&B), FQN
        // Untyped parameters start with: $, ...$, &$

        // Valid type starters (non-exhaustive but covers common cases)
        const typePattern = /^(\?|\\\\?[A-Z]\w*|\w+\\|\w+\||\w+&|int|string|bool|float|array|callable|iterable|object|mixed|void|never|self|static|parent|true|false|null)/;

        // Check if param starts with a type
        if (typePattern.test(param)) {
          // Has a type hint, skip
          continue;
        }

        // Check if param starts with $ (untyped parameter)
        if (/^\$|^\.\.\.\$|^&\$/.test(param)) {
          untypedCount++;
        }
      }
    }

    if (untypedCount > 0) {
      console.log(JSON.stringify({
        decision: 'approve',
        type: 'warning',
        message: `${untypedCount} public/protected method parameter(s) lack type hints in ${filePath}. Add type hints for PHP 8.4 compatibility and IDE support.`
      }));
      return;
    }
  }

  console.log(JSON.stringify({ decision: 'approve' }));
}
