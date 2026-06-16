---
description: Run a security audit — OWASP Top 10, secrets, dependencies, injection vectors
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator returns a `<<<FORGE_GENERIC_MODE>>>` block instead, proceed without profile-specific context.
> **Forward the `<<<FORGE_HANDOFF>>>` block verbatim into each spawned `security-scanner`'s prompt** so they use the already-loaded profile context instead of re-reading `.forge.yaml`.

Use the `security-scanner` agent to audit:

$ARGUMENTS

If no specific scope is given, audit the entire codebase.

Scan order:
1. Secrets (always first — if found, stop and alert before continuing)
2. Dependency CVEs (profile audit command)
3. Static analysis (profile security tool)
4. Manual OWASP Top 10 walkthrough

Fix all CRITICAL and HIGH findings. Report MEDIUM and LOW for user review.

## Depth

Like `/inspect`, `/scan` is a gate: high recall via fan-out, high precision via verification.

**Thorough — default for non-trivial scope.**
1. **Fan out** `security-scanner` agents in parallel (`model: opus`), one per area: injection · auth/authz (incl. IDOR) · secrets & crypto · SSRF/deserialization · input validation · dependency CVEs · misconfig. Each greps the relevant sinks across the codebase.
2. **Dedup** by `file:line`.
3. **Verify twice — no false positives.** For each candidate vuln, spawn a verifier that tries to *refute* it: is the sink reachable with attacker-controlled input, with no mitigating control? Report only confirmed vulns (with a short exploit sketch); uncertain ones go to a "needs human review" footnote.
4. **Loop** until two consecutive rounds add nothing new.
5. **Report** confirmed findings, severity-ranked; state coverage bounds.

**Fast (`--fast`, or narrow scope).** A single `security-scanner` pass.
