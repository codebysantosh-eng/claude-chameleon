---
description: Research, design architecture, and create phased implementation plans — awaits approval before any code
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator enters generic mode (no `<<<FORGE_HANDOFF>>>` block), proceed without profile-specific context.

Use the `architect` agent to design:

$ARGUMENTS

Produce:
1. Research findings from the codebase
2. 2–3 concrete options with trade-offs
3. Recommended option with rationale
4. Phased implementation plan (each phase independently shippable)
5. ADR if the decision has long-term architectural consequences

**Do not write any code.** Wait for explicit user approval of the plan before implementation begins.
