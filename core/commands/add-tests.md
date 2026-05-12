---
description: Retroactively add missing test coverage to existing code
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Add missing tests to:

$ARGUMENTS

If no specific file or pattern is given, discover test gaps across the project.

Workflow:
1. Read `.forge.yaml` → find active profile for the target files
2. Read profile `rules.md` → get test command and coverage command (already in context)
3. Read profile `skills/SKILL.md#testing` → get stack-level test patterns and conventions
4. **Find prior tests in this codebase.** Before writing anything, grep for 2–3 existing tests covering similar code (same module, same feature class). Read at least one in full. Note the project's *actual* conventions: naming, fixture/setup, assertion style, mocking strategy — these often differ from stack-level guidance.
5. Map source files → test files (find gaps)
6. Run existing tests to confirm green baseline
7. Add tests for uncovered behaviour — match the prior tests' shape, not just the stack convention
8. Run coverage check against targets in `~/.claude/rules/testing.md`

Test what the code does, not how it does it. One behaviour per test. Independent tests — no shared mutable state.

**Do not write or modify production code.** If missing coverage requires new production logic, stop and flag it — that is `/tdd` work, not `/add-tests` work.
