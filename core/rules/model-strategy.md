# Model Strategy

**Two-tier rule. No middle.**

- **Opus (latest)** — anything that affects code correctness or quality: writing, editing, reviewing, auditing, debugging, designing, architecting. The cost of a missed bug or vulnerability is orders of magnitude higher than the cost of running Opus. Always use the latest Opus tier (currently Opus 4.8).
- **Haiku 4.5** — shallow read-only work: enumerate files, grep for matches, list directories, summarize a known artifact. No correctness judgment.

There is no Sonnet tier in this kit. If you reach for Sonnet, you're either under-spending on a correctness-sensitive task or over-spending on enumeration.

**Context window**: When context is getting long, use `/explore` to generate a CLAUDE.md, then start a fresh session.

**Extended thinking**: On by default. Disable for simple edits and formatting to save tokens.

| Model | Use when |
|-------|----------|
| Haiku 4.5 | Read, Grep, Glob, file listing, log/diff inspection, codebase mapping, prior-art enumeration |
| Opus (latest) | Code generation, edits, code review, security scan, performance profiling, architecture, design, debugging |

## Subagents inherit the parent model — override explicitly

Subagents inherit the parent's model unless overridden, so an Opus-driven session will silently spend Opus tokens on grep/read tasks that Haiku handles fine. Always pass `model` explicitly when spawning a subagent.

Rule of thumb:
- Read, Grep, Glob, file-listing, log/diff inspection, prior-art enumeration → `model: "haiku"`
- Anything else (code, review, audit, design) → `model: "opus"`

Example:

```jsonc
// Read-only enumeration → Haiku
{ "subagent_type": "Explore", "model": "haiku", "prompt": "..." }

// Correctness-sensitive work → Opus
{ "subagent_type": "code-inspector", "model": "opus", "prompt": "..." }
{ "subagent_type": "tdd-developer", "model": "opus", "prompt": "..." }
```

## Cheap-grep pattern for Opus agents

When an Opus agent needs prior-art enumeration before designing or changing code:
1. Spawn an `Explore` subagent with `model: "haiku"` to list candidate `file:line` matches with one-line descriptions.
2. The Opus agent reads the flagged files in full at its own model to understand the pattern.

This keeps shallow grep work on Haiku while preserving Opus reasoning for the parts that need it.
