---
description: Adversarial code review — bugs, misses, security, quality, and side effects in local changes or a full PR pipeline
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator enters generic mode (no `<<<FORGE_HANDOFF>>>` block), proceed without profile-specific context.

Use the `code-inspector` agent to review:

$ARGUMENTS

**Local mode** (no PR number): review uncommitted changes via `git diff`.
**PR mode** (PR number or URL provided): full pipeline — fetch diff, analyze, post findings as a single structured review body (grouped by file and severity), leave review decision. Do not post line-level inline comments.

Apply the active profile's patterns and forbidden rules to each file reviewed. When files span multiple stacks, apply the matching profile per file.

Rank every finding by severity and required action per the `code-inspector` agent's severity table (the authoritative source): CRITICAL/HIGH block merge, MEDIUM fix before ship, LOW suggest only.
