---
description: Extract reusable patterns from the current session and save to skills
depth: explore
---

Extract and save reusable patterns discovered in this session.

$ARGUMENTS

Workflow:
1. Identify patterns worth preserving (non-obvious, project-specific, reusable)
2. Ask for confirmation: "Found [N] patterns. Save to skills?" 
3. On confirm, save to:
   - `~/.claude/skills/learned/` (personal patterns — your knowledge)
   - `./skills/learned/` (team patterns — commit to share)
4. Format: named `## heading` in a SKILL.md file, prose + example

Do NOT save:
- Patterns already documented in existing SKILL.md files
- Obvious language-level idioms
- One-off solutions with no generalization value

Always ask before saving. Never save silently.
