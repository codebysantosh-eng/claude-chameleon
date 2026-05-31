---
description: Profile code for performance bottlenecks — measure baseline, identify, fix, measure again
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator enters generic mode (no `<<<FORGE_HANDOFF>>>` block), proceed without profile-specific context.

Use the `performance-profiler` agent to investigate:

$ARGUMENTS

No optimization without measurement. Workflow:
1. Establish baseline (measure current performance)
2. Identify bottleneck category (algorithmic, DB, bundle, memory, network)
3. Fix one bottleneck at a time
4. Re-measure after each fix
5. Verify no regressions

Report before/after numbers for every change made.

## Depth

**Thorough — default.** Bottlenecks hide in different layers, so fan out — but every claim is backed by a measurement, never a guess.
1. **Baseline** measurement first (shared context for all lenses).
2. **Fan out** `performance-profiler` agents (`model: opus`), one per category: algorithmic · DB/queries (N+1, indexes, plans) · bundle/asset · memory/leaks · network/IO.
3. **Dedup** hotspots.
4. **Verify twice.** For each proposed bottleneck, a verifier must reproduce it with a measurement (profile, benchmark, or query plan) before it's reported — drop anything not reproducible. No fix without a before-number.
5. Apply **one fix at a time**, re-measure, check for regressions.
6. **Report** before/after for every change; list unverified hotspots separately.

**Fast (`--fast`).** A single `performance-profiler` pass on the given scope.
