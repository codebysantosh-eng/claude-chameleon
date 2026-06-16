---
description: Adversarial code review — bugs, misses, security, quality, and side effects in local changes or a full PR pipeline
depth: deep
---

> **Before proceeding**: invoke the `stack-orchestrator` agent with the current task.
> Only continue once it confirms profiles are loaded or generic mode is active.
> Parse active profiles and commands from the `<<<FORGE_HANDOFF>>>` block in its output.
> If the orchestrator returns a `<<<FORGE_GENERIC_MODE>>>` block instead, proceed without profile-specific context.
> **Forward the `<<<FORGE_HANDOFF>>>` block verbatim into each spawned `code-inspector`'s prompt** so they use the already-loaded profile context instead of re-reading `.forge.yaml`.

Review:

$ARGUMENTS

**Local mode** (default, no PR number): review the **full branch delta vs the base** — every change on this branch that isn't on the base yet, including **committed, staged, and unstaged** work. This matches what the PR will contain, so you can gate the change before pushing.
- Base = the repo's default branch (`main`, else `master`), unless a base branch is given in `$ARGUMENTS`.
- Diff to review: `git diff $(git merge-base HEAD <base>)` — merge-base, so an advancing base doesn't pollute the diff.
- If that diff is empty (nothing committed yet), fall back to `git diff HEAD` so brand-new uncommitted work is still reviewed.
- **State the reviewed scope at the top of the report** (base, commit range, whether uncommitted work was included) — never let "0 findings" be confused with "0 changes seen."

**`--uncommitted`** (escape hatch): review only working-tree changes (staged + unstaged) via `git diff HEAD` — a quick mid-work check, not the full branch.

**PR mode** (PR number or URL provided): fetch diff, analyze, post findings as a single structured review body (grouped by file and severity), leave a review decision. Do not post line-level inline comments.

Apply the active profile's patterns and forbidden rules per file (match the profile to each file's stack on cross-stack diffs).

## Depth

`/inspect` is the merge gate: bias toward catching **everything**, then prove each finding before reporting. A missed bug and a false alarm both erode trust — recall comes from fan-out, precision comes from verifying twice.

**Thorough — default for any non-trivial diff.** Orchestrate, don't single-pass:

1. **Fan out for recall.** Spawn `code-inspector` agents in parallel (`model: opus`), one per lens: correctness · security · misses (absent tests / validation / migration / caller-or-doc updates) · side-effects · tests & coverage · project-pattern deviation. Each must `grep` callers and sibling files of every changed symbol — not diff-only.
2. **Dedup** candidates by `file:line`.
3. **Verify twice — report zero false positives.** For *every* candidate, spawn an independent verifier (`model: opus`) tasked to **refute** it: confirm the cited line/flow exists, the path is reachable, and the bug is real. Report a finding **only if** verification confirms it. When uncertain, do **not** report it as a bug — move it to a "needs human eyes" footnote (never silently drop). Tag each reported finding `confirmed` or `likely`.
4. **Loop until dry.** Repeat the fan-out until two consecutive rounds surface nothing new (dedup against all prior findings).
5. **Report** confirmed findings only, severity-ranked. If coverage was bounded (e.g., a very large diff was sampled), say so explicitly — never imply completeness you didn't reach.

**Fast (`--fast`, or trivial diffs).** A single `code-inspector` pass, no fan-out — for tiny or low-risk changes (pure docs, config, one-liners).

Severity and required action per the `code-inspector` severity table (authoritative): CRITICAL/HIGH block merge, MEDIUM fix before ship, LOW suggest only.
