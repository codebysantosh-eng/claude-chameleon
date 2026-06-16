---
description: Write or update documentation from the actual code — READMEs, API docs, docstrings, CLAUDE.md — never invented, updated in place
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Use the `docs-writer` agent to document:

$ARGUMENTS

If no scope is given, find the highest-value documentation gap (a public API or CLI with no docs, or docs that contradict the code) and propose it before writing.

Principles:
1. Every statement traces to a real symbol or behaviour read from the code — never invented
2. Examples are real and runnable — copy a real call site or test output, don't fabricate
3. Update existing docs in place; preserve anchors other files link to
4. Link to the authoritative source (rules, ADRs, type definitions) instead of duplicating it
5. Flag doc-vs-code drift you can't resolve without a product decision

**Do not change production code.** If a doc is impossible because the code is ambiguous, stop and flag it.
