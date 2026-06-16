---
description: Whole-codebase quality audit — fans out correctness, security, and performance specialists, verifies twice, and returns one unified severity-ranked report
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator returns a `<<<FORGE_GENERIC_MODE>>>` block instead, proceed without profile-specific context.
> **Forward the `<<<FORGE_HANDOFF>>>` block verbatim into every spawned specialist's prompt** so they use the already-loaded profile context instead of re-reading `.forge.yaml`.

Run a comprehensive, multi-dimensional audit of the codebase:

$ARGUMENTS

If no scope is given, audit the whole codebase. This is the **deepest review in the kit** — unlike `/inspect` (diff merge-gate), `/scan` (security), or `/profile` (performance), `/audit` sweeps the *entire* codebase across *every* quality dimension at once. High recall via fan-out, zero false positives via double verification.

## Orchestration (the flagship pattern)

1. **Scope.** Decide the audit surface from `$ARGUMENTS` or the whole repo. For a large repo, partition by top-level module so coverage is explicit, not sampled-by-accident.
2. **Fan out in parallel** (`model: opus`), forwarding the handoff into each agent. Run, concurrently:
   - `code-inspector` — one per lens: correctness · misses (absent tests/validation/migrations/caller updates) · side-effects · tests & coverage · project-pattern deviation
   - `security-scanner` — one per area: injection · auth/authz (incl. IDOR) · secrets & crypto · SSRF/deserialization · dependency CVEs · misconfig
   - `performance-profiler` — establish a baseline first, then one per category: algorithmic · DB/queries (N+1, indexes) · memory · bundle/IO
   Each agent greps callers and siblings across the **whole** codebase, not a diff.
3. **Dedup** all candidates by `file:line` across every specialist (one issue, one entry, tagged with its dimension).
4. **Verify twice — report zero false positives.** For every candidate, spawn an independent verifier (`model: opus`) tasked to **refute** it: confirm the line/flow exists, is reachable, and the issue is real. Report only confirmed findings; uncertain ones go to a "needs human eyes" footnote, never silently dropped.
5. **Loop until dry.** Repeat the fan-out until two consecutive rounds surface nothing new (dedup against all prior findings).
6. **Unified report.** One severity-ranked list (CRITICAL/HIGH/MEDIUM/LOW per the `code-inspector` severity table), each finding tagged `[correctness|security|performance]`. State coverage bounds explicitly if any partition was sampled.

**This command assesses; it does not auto-fix.** Route remediation: `/fix` for build/type errors, `/scan` to auto-apply CRITICAL/HIGH security fixes, `/tdd` for behaviour changes, `/refactor` for structure.

## Fast (`--fast`, or a small scope)

One pass of each specialist on the given scope with single-vote verification — a quick health read rather than the full loop-until-dry sweep.
