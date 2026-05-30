#!/usr/bin/env node
/**
 * forge.core.secret-detector
 * Shared secret scanner inherited by all profiles.
 * Blocks commits containing OWASP-aligned secret patterns.
 */

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Fail closed: a secret guard that can't read its input must not silently let a write through.
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'forge.core.secret-detector: could not parse hook input — blocking to be safe. Re-run; if this persists, check the hook installation.'
    }));
    process.exit(0);
  }
  run(input);
});

function run(input) {
const tool = input.tool_name;
const toolInput = input.tool_input || {};
const targetPath = toolInput.file_path || '';

// Example/template files hold intentional placeholders — skip single-file scans for them.
// (.env.local is NOT skipped: it routinely holds real secrets.)
const isExampleFile = /(\.example|\.sample|\.dist|\.template|\.tmpl)$|\.env\.(example|sample|dist|template)$/i.test(targetPath);

// Obvious placeholder values that should not trip the generic assignment pattern.
// Unambiguous placeholder markers may match as a prefix; ambiguous words that a real
// secret could legitimately start with (secret/password/token/test/null) match only as
// the WHOLE value — otherwise `secretSauce99x` or `tokenL9f8realkey` would slip through.
const PLACEHOLDER_PREFIX = /^(changeme|change[_-]?me|example\w*|placeholder|your[_-]\w*|xxx+|redacted|dummy|fake\w*|insert[_-]?\w+|replace[_-]?me|<[^>]*>)/i;
const PLACEHOLDER_EXACT = /^(secret|password|token|test|none|null|todo|fixme|sample|changeme|example)$/i;
const isPlaceholderValue = v => PLACEHOLDER_PREFIX.test(v) || PLACEHOLDER_EXACT.test(v);

// Core OWASP-aligned patterns (mandatory — profiles extend, never replace)
const CORE_PATTERNS = [
  { pattern: /\b(api_key|secret_key|password|token|private_key|client_secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-+/]{8,})/i, label: 'generic secret assignment', valueGroup: 2 },
  { pattern: /sk_live_[a-zA-Z0-9]+/, label: 'Stripe live key' },
  { pattern: /gh[posru]_[a-zA-Z0-9]{36}/, label: 'GitHub token (ghp/gho/ghs/ghr/ghu)' },
  { pattern: /github_pat_[A-Za-z0-9_]{82}/, label: 'GitHub PAT (fine-grained)' },
  { pattern: /AKIA[0-9A-Z]{16}/, label: 'AWS access key' },
  { pattern: /xox[bpoa]-[0-9a-zA-Z-]+/, label: 'Slack token' },
  { pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, label: 'Private key' },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/, label: 'Google API key' },
  { pattern: /"type"\s*:\s*"service_account"/, label: 'GCP service account JSON' },
  { pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;/, label: 'Azure storage connection string' },
  { pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\./, label: 'JWT token' },
  { pattern: /npm_[A-Za-z0-9]{36}/, label: 'npm auth token' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/, label: 'OpenAI API key' },
  { pattern: /sk-ant-[a-zA-Z0-9\-_]{40,}/, label: 'Anthropic API key' },
  { pattern: /glpat-[A-Za-z0-9\-_]{20}/, label: 'GitLab personal access token' },
  { pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/, label: 'SendGrid API key' },
  { pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@\s]+@/, label: 'MongoDB URI with credentials' },
  { pattern: /postgres(ql)?:\/\/[^:]+:[^@\s]+@/, label: 'PostgreSQL URI with credentials' },
  { pattern: /https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/, label: 'Discord webhook URL' },
  { pattern: /hf_[A-Za-z0-9]{34}/, label: 'Hugging Face token' },
  { pattern: /(ASIA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[0-9A-Z]{16}/, label: 'AWS temporary access key' },
];

// Load extra patterns from environment (set by profile hooks.json)
const EXTRA_PATTERNS_JSON = process.env.FORGE_EXTRA_SECRET_PATTERNS || '[]';
let extraPatterns = [];
try {
  extraPatterns = JSON.parse(EXTRA_PATTERNS_JSON).map(p => ({
    // Strip stateful flags (g/y): checkContent calls .exec() once per line, and a
    // sticky/global regex carries lastIndex between lines, silently skipping matches.
    pattern: new RegExp(p.pattern, (p.flags || '').replace(/[gy]/g, '')),
    label: p.label,
  }));
} catch (e) {
  process.stderr.write(`⚠ forge.core.secret-detector: FORGE_EXTRA_SECRET_PATTERNS is not valid JSON — extra patterns ignored. Error: ${e.message}\n`);
}

const allPatterns = [...CORE_PATTERNS, ...extraPatterns];

function checkContent(content, source) {
  const lines = content.split('\n');
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, label, valueGroup } of allPatterns) {
      const m = pattern.exec(line);
      if (!m) continue;
      // For the generic key=value pattern, skip obvious placeholders to cut false positives.
      if (valueGroup && isPlaceholderValue(m[valueGroup] || '')) continue;
      findings.push(`Line ${i + 1} [${label}]: ${line.slice(0, 80).trim()}`);
    }
  }
  return findings;
}

// Check Write tool content
if (tool === 'Write' && toolInput.content && !isExampleFile) {
  const findings = checkContent(toolInput.content, toolInput.file_path);
  if (findings.length > 0) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: `Secret detected in ${toolInput.file_path}:\n${findings.join('\n')}\n\nROTATE THE SECRET IMMEDIATELY if it was real. Move it to environment variables.`
    }));
    process.exit(0);
  }
}

// Check Edit tool new_string (only scan what's being inserted, not what's being replaced)
if (tool === 'Edit' && toolInput.new_string && !isExampleFile) {
  const findings = checkContent(toolInput.new_string, toolInput.file_path);
  if (findings.length > 0) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: `Secret detected in edit to ${toolInput.file_path}:\n${findings.join('\n')}\n\nROTATE THE SECRET IMMEDIATELY if it was real. Move it to environment variables.`
    }));
    process.exit(0);
  }
}

// Scan staged additions before git commit
if (tool === 'Bash') {
  const cmd = toolInput.command || '';
  if (/(?:^|&&|;|\|)\s*git\s+commit\b/.test(cmd) || /\bgit\s+commit\s+--amend\b/.test(cmd)) {
    const { spawnSync } = require('child_process');
    const diff = spawnSync('git', ['diff', '--cached', '--unified=0'], { encoding: 'utf8', timeout: 5000 });
    if (diff.status === 0 && diff.stdout) {
      // Only scan added lines (starts with '+' but not the '+++' file header)
      const addedContent = diff.stdout
        .split('\n')
        .filter(l => l.startsWith('+') && !l.startsWith('+++'))
        .map(l => l.slice(1))
        .join('\n');
      if (addedContent) {
        const findings = checkContent(addedContent, 'staged changes');
        if (findings.length > 0) {
          console.log(JSON.stringify({
            decision: 'block',
            reason: `Secret detected in staged changes:\n${findings.join('\n')}\n\nROTATE THE SECRET IMMEDIATELY if it was real. Move it to environment variables.`
          }));
          process.exit(0);
        }
      }
    }
  }
}

console.log(JSON.stringify({ decision: 'approve' }));
}
