---
description: Create, maintain, and run end-to-end tests for critical user journeys
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator returns a `<<<FORGE_GENERIC_MODE>>>` block instead, proceed without profile-specific context.
> **Forward the `<<<FORGE_HANDOFF>>>` block verbatim into the agent's prompt** so it uses the already-loaded profile context instead of re-reading `.forge.yaml`.

Use the `e2e-runner` agent to:

$ARGUMENTS

If no specific flow is given, identify and test the most critical user journeys.

Before writing tests:
1. Check active profile's `commands.json` for the `e2e` command. If it is `null`, no E2E runner is configured — report that, recommend the stack's standard runner, and ask before setting one up. Do not run an empty command.
2. Read profile `skills/SKILL.md` for E2E framework patterns and page object conventions
3. Locate existing E2E tests to match conventions

After running: report pass/fail per journey, capture artifacts on failure, flag flaky tests for diagnosis.
