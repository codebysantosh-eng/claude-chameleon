# Model Strategy

**Default model**: Sonnet for all tasks. Escalate to Opus only for architectural decisions and deep analysis. Use Haiku for lightweight worker agents.

**Context window**: When context is getting long, use `/explore` to generate a CLAUDE.md, then start a fresh session.

**Extended thinking**: On by default. Disable for simple edits and formatting to save tokens.

| Model | Use when |
|-------|----------|
| Haiku 4.5 | Repetitive worker tasks, simple checks, pair programming assist |
| Sonnet 4.6 | Default — code generation, review, orchestration |
| Opus 4.7 | Architecture, deep reasoning, complex debugging |
