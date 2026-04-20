---
name: typescript
displayName: TypeScript
detectors:
  - file: tsconfig.json
    weight: 3
  - glob: "src/**/*.ts"
    weight: 3
  - file-contains: [package.json, "typescript"]
    weight: 2
threshold: 5
---

| Category | Tool | Notes |
|----------|------|-------|
| Test | Vitest | Jest-compatible API; use `vi.mock()` for mocking |
| Lint | ESLint | `@typescript-eslint` ruleset required |
| Format | Prettier | `.prettierrc` config; auto-format on save |
| Typecheck | tsc | `--noEmit`; strict mode required |
| Build | tsc / bundler | Depends on project (Next.js, Vite, esbuild) |
| Logger | Pino or Winston | Never `console.log` in production |
| Validation | Zod | Schema validation at all input boundaries |
| Audit | npm audit | `--production` flag for prod-only deps |
| Secrets | .env + dotenv | Never prefix server secrets with `NEXT_PUBLIC_` |

| Pattern | Rule |
|---------|------|
| Types | Prefer `unknown` over `any`; use type guards |
| Immutability | Spread, map, filter — never direct mutation |
| Async | Prefer `Promise.all` for parallel, `allSettled` when partial failure OK |
| Error handling | Custom error classes with `code` + `statusCode`; never swallow |
| Naming | camelCase variables, PascalCase types/classes, UPPER_SNAKE_CASE constants |

| Skill topic | Reference |
|-------------|-----------|
| Testing patterns | skills/SKILL.md#testing |
| Security | skills/SKILL.md#security |
| Coding standards | skills/SKILL.md#coding-standards |
| Observability | skills/SKILL.md#observability |
