---
description: Run a security audit — OWASP Top 10, secrets, dependencies, injection vectors
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator enters generic mode (no `<<<FORGE_HANDOFF>>>` block), proceed without profile-specific context.

Use the `security-scanner` agent to audit:

$ARGUMENTS

If no specific scope is given, audit the entire codebase.

Scan order:
1. Secrets (always first — if found, stop and alert before continuing)
2. Dependency CVEs (profile audit command)
3. Static analysis (profile security tool)
4. Manual OWASP Top 10 walkthrough

Fix all CRITICAL and HIGH findings. Report MEDIUM and LOW for user review.
