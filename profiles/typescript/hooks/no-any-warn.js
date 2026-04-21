#!/usr/bin/env node
/**
 * forge.typescript.no-any-type
 * Warns when `any` type is written to TypeScript files.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const filePath = toolInput.file_path || '';

const isTsFile = /\.(ts|tsx)$/.test(filePath);

const contentToCheck = tool === 'Write' ? (toolInput.content || '') : tool === 'Edit' ? (toolInput.new_string || '') : '';

if (isTsFile && contentToCheck) {
  const anyMatches = (contentToCheck.match(/:\s*any\b/g) || []).length;
  if (anyMatches > 0) {
    console.log(JSON.stringify({
      decision: 'approve',
      type: 'warning',
      message: `${anyMatches} use(s) of \`any\` type in ${filePath}. Prefer \`unknown\` with type guards or a proper interface/type. The \`any\` type disables type safety.`
    }));
    return;
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
