---
description: Diagnose and fix build, type, and compile errors with minimal changes
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Use the `error-resolver` agent to fix the current build errors.

$ARGUMENTS

Steps:
1. Read `.forge.yaml` → find active profile for the failing files
2. Read profile `rules.md` → get the build/typecheck/lint command
3. Run the command and capture the full error output
4. Group errors by root cause
5. Fix one root cause at a time, re-running after each fix
6. Verify 0 errors remain

Rules: minimal changes only. No refactoring, no improvements beyond what's needed to pass.
