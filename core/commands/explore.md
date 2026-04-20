---
description: Map an unfamiliar codebase — generates onboarding guide and CLAUDE.md
depth: explore
---

Use the `code-explorer` agent to map:

$ARGUMENTS

If no specific scope is given, explore the entire project.

Produce:
1. Detected tech stack and active profiles
2. Annotated directory structure
3. Traced key flows (2–3 most important)
4. Conventions and patterns
5. Onboarding guide (how to run, test, deploy)
6. CLAUDE.md ready to commit

Cross-reference detected stack with `.forge.yaml` if it exists.
