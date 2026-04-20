---
description: Implement features using strict test-driven development (RED → GREEN → VERIFY → REFACTOR)
depth: routine
---

Use the `tdd-developer` agent to implement the following using strict TDD:

$ARGUMENTS

Follow the RED → GREEN → VERIFY → REFACTOR cycle. Do not write production code before the failing test exists.

Before writing any code:
1. Read `.forge.yaml` to identify the active profile for the files being touched
2. Read the matching profile's `rules.md` for the test command and forbidden patterns
3. Read the matching profile's `skills/SKILL.md#testing` for test patterns

Coverage targets (from `rules/testing.md`):
- Auth, payments, financial: 100%
- Utilities, helpers: 90%+
- General: 80%+
