---
description: Run comprehensive verification — typecheck, build, lint, format, tests, secrets scan
depth: routine
---

Run the full verification pipeline for this project.

$ARGUMENTS

Pipeline (stop on first failure):
1. **Type check** — from active profile `commands.json` `typecheck` (skip if null)
2. **Build** — from active profile `commands.json` `build` (skip if null)
3. **Lint** — from active profile `commands.json` `lint`
4. **Format check** — from active profile `commands.json` `format` with `--check` flag
5. **Tests** — from active profile `commands.json` `test`
6. **Coverage** — from active profile `commands.json` `coverage` (warn if below targets)
7. **Secrets scan** — grep for known secret patterns
8. **Git status** — check for uncommitted changes

Read `.forge.yaml` → get active profiles → read each profile's `rules.md` for commands.

Report: ✓ passed / ✗ failed for each step. On failure, show exact error and exit.
