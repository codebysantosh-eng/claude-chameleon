#!/usr/bin/env node
/**
 * forge.nextjs.next-public-secret-guard
 * Blocks NEXT_PUBLIC_ prefix on server-only secrets.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

const tool = input.tool_name;
const toolInput = input.tool_input || {};
const content = toolInput.content || '';
const filePath = toolInput.file_path || '';

const serverSecretPatterns = [
  'DATABASE_URL', 'DB_PASSWORD', 'SECRET_KEY', 'PRIVATE_KEY',
  'API_SECRET', 'JWT_SECRET', 'STRIPE_SECRET', 'SENDGRID_API_KEY',
  'AWS_SECRET', 'OPENAI_API_KEY',
];

if (tool === 'Write' && (filePath.includes('.env') || filePath.includes('config'))) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('NEXT_PUBLIC_')) {
      const varName = line.split('=')[0].replace('NEXT_PUBLIC_', '');
      if (serverSecretPatterns.some(p => varName.toUpperCase().includes(p))) {
        console.log(JSON.stringify({
          decision: 'block',
          reason: `NEXT_PUBLIC_${varName} detected on line ${i + 1}. NEXT_PUBLIC_ variables are exposed to the browser. Server-side secrets must never use this prefix.`
        }));
        process.exit(0);
      }
    }
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
