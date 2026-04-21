---
description: Review code for correctness, quality, and maintainability — local changes or full PR pipeline
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator enters generic mode (no `<<<FORGE_HANDOFF>>>` block), proceed without profile-specific context.

Use the `code-inspector` agent to review:

$ARGUMENTS

**Local mode** (no PR number): review uncommitted changes via `git diff`.
**PR mode** (PR number or URL provided): full pipeline — fetch diff, analyze, post inline comments, leave review decision.

Apply the active profile's patterns and forbidden rules to each file reviewed. When files span multiple stacks, apply the matching profile per file.

Severity ranking:
- CRITICAL / HIGH → block merge, fix now
- MEDIUM → fix before ship
- LOW → suggest, don't block
