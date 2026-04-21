# Security

Mandatory checks before every commit.

## Pre-Commit Requirements

- [ ] No hardcoded secrets
- [ ] All user inputs validated at boundaries (schema validation per active profile)
- [ ] No SQL/command/XSS injection vectors
- [ ] Auth on every non-public endpoint (document intentionally public routes)
- [ ] Authorization at resource level (not just authentication)
- [ ] Error messages don't leak internals
- [ ] Sensitive tokens not stored in insecure client storage
- [ ] CSRF protection on routes using cookie auth

## Secrets

- NEVER hardcode — environment variables or secret manager
- Validate required secrets at startup
- Rotate immediately if exposed in code, logs, or errors
- See active profile's `context.md` for stack-specific secrets management tools

## Secrets in Git History

Rotate the secret IMMEDIATELY, then remove from history with `git filter-repo` or BFG Repo Cleaner. Force push is justified here. Audit access logs for unauthorized use.

## Auto-Escalation

Use **security-scanner** agent automatically when touching auth, user input, payments, or API endpoints.

## Reference

See active profile's `skills/SKILL.md#security` for stack-specific patterns.
