#!/usr/bin/env node
/**
 * forge.nextjs.next-public-secret-guard
 * Blocks NEXT_PUBLIC_ prefix on server-only secrets.
 */
const { readInput, allow, deny } = require('../../../core/hooks/scripts/lib/hook-io');

readInput(run, { failClosed: true, label: 'forge.nextjs.next-public-secret-guard' });

function run(input) {
  const tool = input.tool_name;
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || '';

  const serverSecretPatterns = [
    'DATABASE_URL', 'DB_PASSWORD', 'SECRET_KEY', 'PRIVATE_KEY',
    'API_SECRET', 'JWT_SECRET', 'STRIPE_SECRET', 'SENDGRID_API_KEY',
    'AWS_SECRET', 'OPENAI_API_KEY', 'PASSWORD', 'PASSPHRASE', 'CLIENT_SECRET',
  ];

  const contentToCheck = tool === 'Write' ? (toolInput.content || '')
    : tool === 'Edit' ? (toolInput.new_string || '')
    : '';

  if (contentToCheck) {
    const lines = contentToCheck.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // Match NEXT_PUBLIC_ in env files (NEXT_PUBLIC_FOO=...) and source (process.env.NEXT_PUBLIC_FOO)
      const match = lines[i].match(/NEXT_PUBLIC_([A-Z0-9_]+)/);
      if (match) {
        const varName = match[1];
        if (serverSecretPatterns.some(p => varName.toUpperCase().includes(p))) {
          deny(`NEXT_PUBLIC_${varName} detected on line ${i + 1} in ${filePath}. NEXT_PUBLIC_ variables are exposed to the browser. Server-side secrets must never use this prefix.`);
        }
      }
    }
  }
  allow();
}
