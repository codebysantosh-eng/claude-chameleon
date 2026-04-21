#!/usr/bin/env node
/**
 * forge.php-laravel.no-hardcoded-secrets
 * Detects hardcoded secrets: API keys, DB credentials, tokens, private keys.
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

  // Skip test files and .env.example (intentional placeholders)
  const isTestFile = /Test\.php$|test\.php$|\.test\.php$|Factory\.php$|Seeder\.php$/i.test(filePath);
  const isExampleEnv = /\.env\.example$|\.env\.sample$|\.env\.dist$/.test(filePath);
  const isPhpOrEnvFile = /\.(php|env)$/.test(filePath);

  if ((tool === 'Write' || tool === 'Edit') && isPhpOrEnvFile && !isTestFile && !isExampleEnv) {
    const findings = [];

    // Hardcoded credentials in config arrays
    if (/(password|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|encryption[_-]?key)['"]\s*=>\s*['"][^'"\s]{6,}['"]/gi.test(content)) {
      findings.push('config_credential');
    }

    // env() with credential-like fallback
    if (/env\(\s*['"][^'"]*(password|secret|token|key)[^'"]*['"]\s*,\s*['"][^'"\s]{6,}['"]\s*\)/gi.test(content)) {
      findings.push('env_fallback');
    }

    // Stripe/vendor keys (sk_live, pk_test, rk_live, etc.)
    if (/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/.test(content)) {
      findings.push('vendor_key');
    }

    // AWS Access Key
    if (/\bAKIA[0-9A-Z]{16}\b/.test(content)) {
      findings.push('aws_key');
    }

    // Google API Key
    if (/\bAIza[0-9A-Za-z_\-]{35}\b/.test(content)) {
      findings.push('google_key');
    }

    // GitHub tokens
    if (/\bghs_[A-Za-z0-9]{36}\b|\bgho_[A-Za-z0-9]{36}\b|\bghp_[A-Za-z0-9]{36}\b/.test(content)) {
      findings.push('github_token');
    }

    // Slack tokens
    if (/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/.test(content)) {
      findings.push('slack_token');
    }

    // JWT-like tokens
    if (/\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/.test(content)) {
      findings.push('jwt_token');
    }

    // Database connection URIs with credentials
    if (/(mysql|postgres|redis|mongodb)(?:\+srv)?:\/\/[^:\/\s]+:[^@\s]+@/.test(content)) {
      findings.push('db_uri');
    }

    // Private key blocks
    if (/-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/.test(content)) {
      findings.push('private_key');
    }

    if (findings.length > 0) {
      const typeLabels = {
        config_credential: 'hardcoded credential',
        env_fallback: 'env fallback with value',
        vendor_key: 'API key (Stripe/similar)',
        aws_key: 'AWS access key',
        google_key: 'Google API key',
        github_token: 'GitHub token',
        slack_token: 'Slack token',
        jwt_token: 'JWT token',
        db_uri: 'database URI with credentials',
        private_key: 'private key block'
      };

      const labels = [...new Set(findings)].map(t => typeLabels[t] || t).join(', ');
      console.log(JSON.stringify({
        decision: 'approve',
        type: 'warning',
        message: `Potential hardcoded secret (${labels}) in ${filePath}. Use env() helper or .env file.`
      }));
      return;
    }
  }

  console.log(JSON.stringify({ decision: 'approve' }));
}
