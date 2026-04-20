---
description: Retroactively add missing test coverage to existing code
depth: routine
---

Add missing tests to:

$ARGUMENTS

If no specific file or pattern is given, discover test gaps across the project.

Workflow:
1. Read `.forge.yaml` → find active profile for the target files
2. Read profile `rules.md` → get test command and coverage command
3. Read profile `skills/SKILL.md#testing` → get test patterns and conventions
4. Map source files → test files (find gaps)
5. Run existing tests to confirm green baseline
6. Add tests for uncovered behaviour — match existing conventions exactly
7. Run coverage check against targets in `rules/testing.md`

Test what the code does, not how it does it. One behaviour per test. Independent tests — no shared mutable state.
