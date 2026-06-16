---
description: Prepare a pull request from the current branch — verify, then draft a conventional title and What/Why/How/Test Plan body. Never pushes or opens without explicit instruction.
depth: routine
---

> **Stack context**: If `.forge.yaml` exists at the project root, active profile rules apply. If not, run `/explore` first — this command continues in generic mode without stack-specific guidance.

Prepare a pull request for the current branch.

$ARGUMENTS

Steps:
1. **Survey the change** — `git status`, `git diff main...HEAD` (or the base branch), and recent commits on the branch. Understand what actually changed.
2. **Verify before proposing** — run `/healthcheck`; for non-trivial diffs, run `/inspect` and fold any CRITICAL/HIGH findings into the summary (or stop and recommend fixing them first).
3. **Draft the PR**, following `git.md`:
   - **Title**: conventional commit form — `type(scope): description`
   - **Body**: **What** (the change), **Why** (the motivation/issue), **How** (the approach + notable decisions), **Test Plan** (what you ran / how a reviewer verifies)
   - Keep it < 500 lines of diff where possible; if larger, call out why and suggest a split
4. **Present the draft for review.** Show the title and body.

**Do not push, commit, or open the PR unless the user explicitly asks.** Only when instructed: create the branch/commit as directed, then `gh pr create` with the approved title and body. Never use `--force` or `--no-verify`.
