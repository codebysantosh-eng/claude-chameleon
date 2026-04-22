# Workflow

Always-on discipline for implementation sessions.

## Plan Mode

**Default**: Enter plan mode for any non-trivial change — file edits, config changes, new features, refactors, or architectural decisions. Never write code before presenting the approach and waiting for explicit user approval.

**Trivial exceptions** (skip plan mode):
- Typo fixes where the change is completely unambiguous (e.g., fixing a misspelled variable name across a single file)
- Single-line renames where intent is obvious (e.g., `const x = 1` → `const MAX_RETRIES = 1`)

For everything else: explore, propose in a plan, wait for approval, then implement.

## Changes and Commits

- **Don't auto-commit**: Changes stay local. User decides when to commit. Never assume you should commit on behalf of the user.
- **Ask before destructive operations**: Force push, reset --hard, deleting branches, modifying CI/CD. Confirm first.
- **Ask before making assumptions**: If a request is ambiguous or could go multiple ways, ask. Don't guess.

## Context and Scope

- When context gets long, run `/explore` to generate a CLAUDE.md, then start a fresh session. This keeps the workspace anchored and prevents drift.
- Use memory to track learnings that apply to this project or user across sessions.

## Reference

See `git.md` for commit conventions, branch strategy, and PR rules.
