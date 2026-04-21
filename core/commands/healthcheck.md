---
description: Run comprehensive verification — typecheck, build, lint, format, tests, secrets scan
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Run the full verification pipeline for this project.

$ARGUMENTS

Pipeline (stop on first failure):
1. **Type check** — from active profile `commands.json` `typecheck` (skip if null)
2. **Build** — from active profile `commands.json` `build` (skip if null)
3. **Lint** — from active profile `commands.json` `lint`
4. **Format check** — from active profile `commands.json` `format-check` if defined, otherwise skip (do not append `--check` to the `format` command — formatters differ)
5. **Tests** — from active profile `commands.json` `test`
6. **Coverage** — from active profile `commands.json` `coverage` (warn if below targets)
7. **Secrets scan** — grep for known secret patterns
8. **Git status** — check for uncommitted changes

Read `.forge.yaml` → get active profiles → read each profile's `commands.json` for commands.

Report: ✓ passed / ✗ failed for each step. On failure, show exact error and exit.
