---
description: Research, design architecture, and create phased implementation plans — awaits approval before any code
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator returns a `<<<FORGE_GENERIC_MODE>>>` block instead, proceed without profile-specific context.
> **Forward the `<<<FORGE_HANDOFF>>>` block verbatim into the agent's prompt** so it uses the already-loaded profile context instead of re-reading `.forge.yaml`.

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

## Depth

**Thorough — default for non-trivial designs.** A single train of thought anchors on its first idea, so generate and judge independently (judge-panel, not fan-out-verify).
1. **Generate** candidate designs in parallel (`architect`, `model: opus`) from distinct angles — e.g. MVP-first, reuse-first (lean on existing patterns), risk-first. Each produces the full Produce-list above.
2. **Judge panel.** Score every candidate with independent judges on: fit to existing patterns (reuse), simplicity, risk, and effort.
3. **Synthesize** the recommendation from the winner, grafting the best ideas from runners-up; cite why it beat the others.
4. Present research + prior art + the synthesized recommendation + phased plan, then await the user's decision. **No code.**

**Fast (`--fast`, or a small/well-scoped change).** A single `architect` pass producing the three-option analysis.
