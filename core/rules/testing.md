# Testing

**This is the authoritative source for coverage targets.** All agents and commands reference this rule.

## Coverage Targets

| Code Type | Target |
|-----------|--------|
| Auth, payments, financial calculations | 100% |
| Utilities, helpers | 90%+ |
| General | 80%+ |

## Required Test Types

| Type | Scope | When |
|------|-------|------|
| Unit | Functions, utilities | Every new function |
| Integration | API endpoints, DB ops | Every endpoint |
| E2E | Critical user flows | Before releases |

## TDD Workflow

1. Write test (RED) — must fail
2. Implement (GREEN) — minimum to pass
3. Verify — typecheck + lint + format + full test suite
4. Refactor (IMPROVE) — tests stay green
5. Coverage check — fill gaps

## Test Quality

- One behaviour per test
- Independent — no shared mutable state
- Descriptive names: `"returns 404 when user not found"`
- Test behaviour, not implementation details

## Logging Standards

Use structured logging instead of raw print statements:
- **Levels**: `error` (failures), `warn` (degraded), `info` (business events), `debug` (dev only)
- **Correlation IDs**: Include request ID in every log for tracing
- **Format**: Structured JSON in production, pretty-print in development
- **Never log**: passwords, tokens, PII, full error stacks to users
- See active profile's `context.md` for the stack-specific logging library

## On Failure

- Fix implementation, not tests (unless test is wrong)
- Run `/tdd` for TDD guidance
- Run `/fix` for build errors

## Reference

See `skills/tdd-patterns/SKILL.md` for patterns specific to the active stack.
