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

If a secret has been committed to git history:

1. **Rotate the secret IMMEDIATELY** — do not wait for history cleanup
2. **Invalidate** all active sessions using the compromised secret
3. **Remove from history** using `git filter-repo` or BFG Repo Cleaner
4. **Force push** (the one justified use case for `--force`)
5. **Check** secret scanning alerts for exposure timeline
6. **Audit** access logs for unauthorized use during exposure window
7. **Search codebase** for similar patterns that may also be exposed

## Auto-Escalation

Use **security-scanner** agent automatically when touching:
- Authentication / authorization code
- User input handling / file uploads
- Database queries with user data
- Payment or financial logic
- API endpoints

## Emergency Protocol

1. STOP current work
2. Run `/scan`
3. Fix CRITICAL issues before anything else
4. Rotate exposed secrets
5. Search codebase for similar patterns

## Reference

See active profile's `skills/SKILL.md#security` for stack-specific security patterns and tools.
