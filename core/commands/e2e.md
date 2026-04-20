---
description: Create, maintain, and run end-to-end tests for critical user journeys
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.

Use the `e2e-runner` agent to:

$ARGUMENTS

If no specific flow is given, identify and test the most critical user journeys.

Before writing tests:
1. Check active profile's `commands.json` for the `e2e` command
2. Read profile `skills/SKILL.md` for E2E framework patterns and page object conventions
3. Locate existing E2E tests to match conventions

After running: report pass/fail per journey, capture artifacts on failure, flag flaky tests for diagnosis.
