---
description: Audit and upgrade dependencies safely — CVEs first, one change at a time, tests green after each
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Use the `dependency-manager` agent to:

$ARGUMENTS

If no scope is given, audit all dependencies and upgrade what's safe.

Workflow:
1. Read `.forge.yaml` → active profiles → each profile's `commands.json` for `audit`, `test`, `build`, `lint`
2. Baseline: run the audit command (CVEs) + the package manager's outdated report, and confirm a green test suite before touching anything
3. Upgrade in increasing-risk order — **security first**, then patch, then minor, then major (read the changelog before any major)
4. One upgrade at a time: bump → regenerate the lockfile via the package manager → build + test + lint → keep if green, revert + flag if not
5. Re-audit to confirm the targeted CVEs are gone and no new ones appeared

Rules: never hand-edit lockfiles; never leave the tree red; **do not commit** — leave verified changes staged for the user. A major upgrade that needs broad code changes is a planned task, not an improvised migration — hand it back.
