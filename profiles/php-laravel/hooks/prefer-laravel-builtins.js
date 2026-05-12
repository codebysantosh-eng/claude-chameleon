#!/usr/bin/env node
/**
 * forge.php-laravel.prefer-laravel-builtins
 *
 * Two narrow, high-value catches only — the rest is documented in
 * profiles/php-laravel/skills/SKILL.md#laravel-first and enforced at code
 * review time by Larastan and /inspect. Trying to lint every generic-PHP
 * idiom at write time creates alert fatigue and false positives.
 *
 *   1. env() called outside config/*.php
 *      Returns null after `php artisan config:cache` in production — silent
 *      and breaks only on the deployed box. Worth catching at write time.
 *
 *   2. password_hash() / password_verify() in app code
 *      Security-sensitive; Laravel's Hash facade rotates work factor centrally
 *      and matches the configured auth driver.
 *
 * Skips: tests, factories, seeders, migrations, vendor, bootstrap,
 * storage/framework, and config/*.php itself (where env() is correct).
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

  if (!filePath.endsWith('.php') || (tool !== 'Write' && tool !== 'Edit')) {
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  const skipPath = (
    /\/tests\//.test(filePath) ||
    /Test\.php$|test\.php$|\.test\.php$/.test(filePath) ||
    /Factory\.php$|Seeder\.php$/.test(filePath) ||
    /\/database\/(migrations|seeders|factories)\//.test(filePath) ||
    /\/vendor\//.test(filePath) ||
    /\/bootstrap\//.test(filePath) ||
    /\/storage\/framework\//.test(filePath)
  );
  if (skipPath) {
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  const isConfigFile = /\/config\/[^/]+\.php$/.test(filePath);
  const findings = [];

  // 1. env() outside config/*.php — null after config:cache in production.
  if (!isConfigFile && /(^|[^>:$\w\\])env\s*\(/m.test(content)) {
    findings.push(
      "env() outside config/*.php → use config('services.foo.key'). " +
      "env() returns null after `php artisan config:cache` in production."
    );
  }

  // 2. password_hash / password_verify → Hash facade.
  if (/(^|[^>:$\w\\])(password_hash|password_verify|password_needs_rehash)\s*\(/m.test(content)) {
    findings.push(
      "password_hash / password_verify → use Hash::make / Hash::check / Hash::needsRehash. " +
      "The facade rotates work factor centrally and matches the auth driver."
    );
  }

  if (findings.length === 0) {
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  console.log(JSON.stringify({
    decision: 'approve',
    type: 'warning',
    message:
      `Laravel built-in preferred in ${filePath}:\n` +
      findings.map(f => `  • ${f}`).join('\n') +
      `\n(See profiles/php-laravel/skills/SKILL.md#laravel-first for the full mapping.)`,
  }));
}
