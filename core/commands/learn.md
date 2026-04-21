---
description: Extract reusable patterns from the current session and save to skills
depth: explore
---

Extract and save reusable patterns discovered in this session.

$ARGUMENTS

Workflow:
1. Identify patterns worth preserving (non-obvious, project-specific, reusable)
2. Ask for confirmation: "Found [N] patterns. Save to skills?"
3. On confirm, for each pattern:
   - Determine target file: `~/.claude/skills/learned/SKILL.md` (personal) or `./skills/learned/SKILL.md` (team)
   - If the file exists, read it first and check for an existing `## heading` that matches this pattern
   - If a matching heading exists: skip silently (already saved)
   - If no matching heading: append the new `## heading` section to the file
   - If the file does not exist: create it with the new section
4. Format: named `## heading` in SKILL.md, prose + example

Do NOT save:
- Patterns already documented in existing SKILL.md files
- Obvious language-level idioms
- One-off solutions with no generalization value

Always ask before saving. Never save silently. Never overwrite existing sections.
