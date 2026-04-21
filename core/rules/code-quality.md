# Code Quality

Always-on guardrails for every file you touch.

## Immutability (CRITICAL)

Create new objects. Never mutate. Use language-idiomatic immutable patterns (spread, map, filter, etc.) — not direct assignment.

## Thresholds

| Metric | Limit |
|--------|-------|
| Function length | < 50 lines |
| File length | < 800 lines |
| Nesting depth | < 4 levels |
| Parameters | < 4 (use options object) |

## Error Handling

- Handle at every level — never swallow
- Generic messages to users, details in server logs
- Validate external input at boundaries
- Fail fast on missing config at startup

## Naming

- Specific: `userEmail` not `data`
- Functions: verb prefix (`fetch`, `calculate`, `is`)
- Booleans: `is`/`has`/`can`/`should`
- Files: kebab-case (utilities), PascalCase (components)

## Logging

- Use structured logging — never raw print/console statements in production
- Include: log levels (error, warn, info, debug), correlation IDs, structured output
- See active profile's `context.md` for the stack-specific logging library
- See `~/.claude/rules/testing.md` for logging standards in tests

## Forbidden in Source Code

- Raw `print()` / `console.log()` / `var_dump()` in production code (use structured logger)
- `debugger` statements
- Commented-out code (use git history)
- TODO without ticket number

## Reference

See `skills/coding-standards/SKILL.md` for detailed patterns.
