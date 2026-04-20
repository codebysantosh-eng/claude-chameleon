#!/usr/bin/env node
/**
 * forge.typescript.no-any-type
 * Warns when `any` type is written to TypeScript files.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';
const content = toolInput.content || '';

const isTsFile = /\.(ts|tsx)$/.test(filePath);

if ((tool === 'Write') && isTsFile) {
  const anyMatches = (content.match(/:\s*any\b/g) || []).length;
  if (anyMatches > 0) {
    console.log(JSON.stringify({
      type: 'warning',
      message: `${anyMatches} use(s) of \`any\` type in ${filePath}. Prefer \`unknown\` with type guards or a proper interface/type. The \`any\` type disables type safety.`
    }));
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
