#!/usr/bin/env node
/**
 * forge.prisma.schema-change-remind
 * Reminds to run prisma generate + migrate after schema changes.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';

if ((tool === 'Write' || tool === 'Edit') && filePath.endsWith('.prisma')) {
  console.log(JSON.stringify({
    decision: 'approve',
    type: 'info',
    message: `Prisma schema changed (${filePath}). Remember to:\n  1. npx prisma generate  (update the client)\n  2. npx prisma migrate dev  (create a migration)\n  3. For breaking changes: use expand-contract pattern (see skills/SKILL.md#migrations)`
  }));
  return;
}

console.log(JSON.stringify({ decision: 'approve' }));
}
