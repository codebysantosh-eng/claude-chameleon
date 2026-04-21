#!/usr/bin/env node
/**
 * forge.nextjs.next-public-secret-guard
 * Blocks NEXT_PUBLIC_ prefix on server-only secrets.
 */
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => { run(JSON.parse(raw)); });

function run(input) {

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const content = toolInput.content || '';
const filePath = toolInput.file_path || '';

const serverSecretPatterns = [
  'DATABASE_URL', 'DB_PASSWORD', 'SECRET_KEY', 'PRIVATE_KEY',
  'API_SECRET', 'JWT_SECRET', 'STRIPE_SECRET', 'SENDGRID_API_KEY',
  'AWS_SECRET', 'OPENAI_API_KEY',
];

const contentToCheck = tool === 'Write' ? content
  : tool === 'Edit' ? (toolInput.new_string || '')
  : '';

if (contentToCheck) {
  const lines = contentToCheck.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match NEXT_PUBLIC_ in env files (NEXT_PUBLIC_FOO=...) and source files (process.env.NEXT_PUBLIC_FOO)
    const match = line.match(/NEXT_PUBLIC_([A-Z0-9_]+)/);
    if (match) {
      const varName = match[1];
      if (serverSecretPatterns.some(p => varName.toUpperCase().includes(p))) {
        console.log(JSON.stringify({
          decision: 'block',
          reason: `NEXT_PUBLIC_${varName} detected on line ${i + 1} in ${filePath}. NEXT_PUBLIC_ variables are exposed to the browser. Server-side secrets must never use this prefix.`
        }));
        process.exit(0);
      }
    }
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
