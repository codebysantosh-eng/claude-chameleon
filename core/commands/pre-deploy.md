---
description: Deployment readiness checklist — verify CI, migrations, env vars, and rollback plan before shipping
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Run the pre-deployment readiness checklist.

$ARGUMENTS

Checklist (report ✓ / ✗ / ⚠ for each):
1. **CI/CD green** — last pipeline run passed on this branch
2. **Healthcheck** — run `/healthcheck` and confirm all steps pass
3. **Migrations** — pending database migrations identified and ready to run
4. **Environment variables** — required env vars set in target environment
5. **Dependencies** — no known CVEs in production dependencies (profile's `commands.json` `audit` command)
6. **Secrets** — no hardcoded secrets in the diff
7. **Rollback plan** — previous version or migration rollback documented
8. **Feature flags** — new features behind flags if they affect all users
9. **Monitoring** — alerting/logging in place for new code paths

Read `.forge.yaml` → get active profiles → read each profile's `commands.json` for audit, test, and lint commands.

Only approve deployment when all CRITICAL items are ✓. Flag ⚠ items for awareness.
