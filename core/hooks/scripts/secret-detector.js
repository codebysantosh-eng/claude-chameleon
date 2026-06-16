#!/usr/bin/env node
/**
 * forge.core.secret-detector
 * Shared secret scanner inherited by all profiles.
 * Blocks commits containing OWASP-aligned secret patterns.
 */

const { readInput, allow, deny } = require('./lib/hook-io');

readInput(run, { failClosed: true, label: 'forge.core.secret-detector' });

function run(input) {
const tool = input.tool_name;
const toolInput = input.tool_input || {};
const targetPath = toolInput.file_path || toolInput.notebook_path || '';

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
  // Normalize before scanning. Notebook cell source is officially `string | string[]`
  // (the array form is the canonical on-disk shape), and Write/Edit payloads could be
  // non-strings. Coerce to a string so .split never throws — a throw here exits non-zero,
  // which fails OPEN under the hook contract and would let a secret slip past.
  const text = Array.isArray(content) ? content.join('') : String(content == null ? '' : content);
  const lines = text.split('\n');
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
    deny(`Secret detected in ${toolInput.file_path}:\n${findings.join('\n')}\n\nROTATE THE SECRET IMMEDIATELY if it was real. Move it to environment variables.`);
  }
}

// Check Edit tool new_string (only scan what's being inserted, not what's being replaced)
if (tool === 'Edit' && toolInput.new_string && !isExampleFile) {
  const findings = checkContent(toolInput.new_string, toolInput.file_path);
  if (findings.length > 0) {
    deny(`Secret detected in edit to ${toolInput.file_path}:\n${findings.join('\n')}\n\nROTATE THE SECRET IMMEDIATELY if it was real. Move it to environment variables.`);
  }
}

// Check MultiEdit edits[] — scan every inserted new_string (not the replaced text)
if (tool === 'MultiEdit' && Array.isArray(toolInput.edits) && !isExampleFile) {
  const inserted = toolInput.edits.map(e => (e && e.new_string) || '').join('\n');
  if (inserted) {
    const findings = checkContent(inserted, targetPath);
    if (findings.length > 0) {
      deny(`Secret detected in edit to ${targetPath}:\n${findings.join('\n')}\n\nROTATE THE SECRET IMMEDIATELY if it was real. Move it to environment variables.`);
    }
  }
}

// Check NotebookEdit new_source (the code being written into a notebook cell)
if (tool === 'NotebookEdit' && toolInput.new_source && !isExampleFile) {
  const findings = checkContent(toolInput.new_source, targetPath);
  if (findings.length > 0) {
    deny(`Secret detected in ${targetPath}:\n${findings.join('\n')}\n\nROTATE THE SECRET IMMEDIATELY if it was real. Move it to environment variables.`);
  }
}

// Scan staged additions before git commit
if (tool === 'Bash') {
  const cmd = toolInput.command || '';
  // Match `git commit` even when preceded by env-var assignments (`FOO=bar git commit`)
  // or global options between `git` and `commit` (`git -c k=v commit`, `git --no-pager
  // commit`). Each of those evades a strict `git\s+commit` trigger and would let a staged
  // secret commit unscanned. The trigger only needs to FIRE the diff scan; over-firing is
  // harmless (the scan finds nothing on a no-op), so we accept a broad `git ... commit`.
  const isGitCommit = /(?:^|&&|;|\|)\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*git\s+(?:-c\s+\S+\s+|--?\S+\s+)*commit\b/.test(cmd);
  if (isGitCommit) {
    const { spawnSync } = require('child_process');
    // Resolve the repo root so the scan works regardless of the hook's cwd.
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5000 });
    const cwd = top.status === 0 && top.stdout ? top.stdout.trim() : process.cwd();
    const diff = spawnSync('git', ['diff', '--cached', '--unified=0'], { encoding: 'utf8', timeout: 5000, cwd });
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
          deny(`Secret detected in staged changes:\n${findings.join('\n')}\n\nROTATE THE SECRET IMMEDIATELY if it was real. Move it to environment variables.`);
        }
      }
    }
  }
}

allow();
}
