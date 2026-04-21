---
description: Implement features using strict test-driven development (RED → GREEN → VERIFY → REFACTOR)
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Use the `tdd-developer` agent to implement the following using strict TDD:

$ARGUMENTS

Follow the RED → GREEN → VERIFY → REFACTOR cycle. Do not write production code before the failing test exists.

Before writing any code:
1. Read `.forge.yaml` to identify the active profile for the files being touched
2. Read the active profile's `commands.json` for the test command and `rules.md` for forbidden patterns
3. Read the matching profile's `skills/SKILL.md#testing` for test patterns

Coverage targets are in `~/.claude/rules/testing.md`.
