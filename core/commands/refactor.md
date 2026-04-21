---
description: Restructure existing code safely — one change at a time, tests stay green
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Refactor the following safely:

$ARGUMENTS

Rules:
1. Verify tests exist and pass before starting (`git stash` if needed to confirm baseline)
2. Make ONE structural change at a time
3. Run the test suite after each change
4. Commit atomically after each passing change
5. If tests break: revert that change, diagnose, try a safer approach

Do not change behaviour. If you notice a bug during refactoring, note it but do not fix it — that's a separate task.

Before starting:
- Read `.forge.yaml` → find active profile
- Get test command from profile `rules.md`
- Run full test suite to establish green baseline
