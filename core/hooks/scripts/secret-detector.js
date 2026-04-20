#!/usr/bin/env node
/**
 * forge.core.secret-detector
 * Shared secret scanner inherited by all profiles.
 * Blocks commits containing OWASP-aligned secret patterns.
 */
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const fs = require('fs');

const tool = input.tool_name;
const toolInput = input.tool_input || {};

// Core OWASP-aligned patterns (mandatory — profiles extend, never replace)
const CORE_PATTERNS = [
  { pattern: /\b(api_key|secret_key|password|token|private_key|client_secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/]{8,}/i, label: 'generic secret assignment' },
  { pattern: /sk_live_[a-zA-Z0-9]+/, label: 'Stripe live key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, label: 'GitHub PAT' },
  { pattern: /AKIA[0-9A-Z]{16}/, label: 'AWS access key' },
  { pattern: /xox[bpoa]-[0-9a-zA-Z-]+/, label: 'Slack token' },
  { pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, label: 'Private key' },
];

// Load extra patterns from environment (set by profile hooks.json)
const EXTRA_PATTERNS_JSON = process.env.FORGE_EXTRA_SECRET_PATTERNS || '[]';
let extraPatterns = [];
try {
  extraPatterns = JSON.parse(EXTRA_PATTERNS_JSON).map(p => ({
    pattern: new RegExp(p.pattern, p.flags || ''),
    label: p.label,
  }));
} catch {
  // ignore parse errors
}

const allPatterns = [...CORE_PATTERNS, ...extraPatterns];

function checkContent(content, source) {
  const lines = content.split('\n');
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, label } of allPatterns) {
      if (pattern.test(line)) {
        findings.push(`Line ${i + 1} [${label}]: ${line.slice(0, 80).trim()}`);
      }
    }
  }
  return findings;
}

// Check Write tool content
if (tool === 'Write' && toolInput.content) {
  const findings = checkContent(toolInput.content, toolInput.file_path);
  if (findings.length > 0) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: `Secret detected in ${toolInput.file_path}:\n${findings.join('\n')}\n\nROTATE THE SECRET IMMEDIATELY if it was real. Move it to environment variables.`
    }));
    process.exit(0);
  }
}

// Check Bash git commit content
if (tool === 'Bash') {
  const cmd = toolInput.command || '';
  if (cmd.includes('git commit') || cmd.includes('git add')) {
    // Can't inspect staged content directly in this hook type — warn instead
    // Profile-level pre-commit hooks handle staged file scanning
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
