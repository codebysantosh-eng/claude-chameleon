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
1. **Research findings** from the codebase
2. **Prior Art** section listing 2–3 existing implementations of the same shape with `file:line` citations (or explicitly state "no prior art found")
3. **Exactly three** concrete options, each with: **Reuses** (citing prior art or justifying a new abstraction), explicit **Pros** and **Cons** bullets (≥ 2 each), and **Risk**
4. A clear **Recommendation** stating which option wins and why, ending with an explicit prompt for the user to decide
5. Phased implementation plan for the recommended option (each phase independently shippable)
6. ADR if the decision has long-term architectural consequences

**Prefer reuse over invention.** On an established codebase, an option that leans on an existing pattern is almost always preferable to a new abstraction unless the new abstraction is explicitly justified.

**Do not write any code.** Wait for the user to confirm the recommended option (or pick a different one) before implementation begins.
