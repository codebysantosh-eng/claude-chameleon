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
