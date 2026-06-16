---
description: Restructure existing code safely — one change at a time, tests stay green
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Refactor the following safely:

$ARGUMENTS

Rules:
1. Verify tests exist and pass before starting (`git stash` if needed to confirm baseline)
2. **Identify the target pattern by citing an existing exemplar.** Before touching code, grep the codebase for 2–3 places where the desired post-refactor shape already exists. Cite the chosen exemplar with `file:line`. If no exemplar exists, state "new pattern — justified because …" before proceeding. A refactor that converges toward an existing pattern is almost always better than one that invents.
3. Make ONE structural change at a time
4. Run the test suite after each change
5. Keep each structural change isolated and independently revertible. **Do not commit** — changes stay local until the user asks (see `git.md`). If the user has explicitly authorized commits, commit atomically after each passing change; otherwise leave the staged sequence for them to review.
6. If tests break: revert that change, diagnose, try a safer approach

Do not change behaviour. If you notice a bug during refactoring, note it but do not fix it — that's a separate task.

Before starting:
- Read `.forge.yaml` → find active profile
- Get test command from profile `rules.md` (already in context)
- Run full test suite to establish green baseline
