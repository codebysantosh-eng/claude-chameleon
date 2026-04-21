---
name: nextjs
displayName: Next.js (App Router)
detectors:
  - file: next.config.js
    weight: 4
  - file: next.config.ts
    weight: 4
  - file-contains: [package.json, "\"next\""]
    weight: 3
  - glob: "app/**/*.tsx"
    weight: 2
threshold: 5
---

| Category | Tool | Notes |
|----------|------|-------|
| Framework | Next.js 14+ App Router | Server Components default; Client Components explicit |
| Test | Vitest + @testing-library/react | Use `renderHook` for custom hooks |
| E2E | Playwright | Page Object Model; semantic selectors |
| Lint | ESLint + next/core-web-vitals | `eslint-config-next` required |
| Format | Prettier | Auto-format on save |
| Logger | Pino | JSON in prod, pretty-print in dev |
| Validation | Zod | Required at Server Actions + API routes |
| Secrets | .env.local | Never `NEXT_PUBLIC_` for server-side secrets |
| Images | next/image | Always specify `sizes`, `priority` for LCP |
| Fonts | next/font | Zero layout shift; no external font CDN |

| Pattern | Rule |
|---------|------|
| Component default | Server Component (async, DB access, zero client JS) |
| Client Components | Add `"use client"` only when needed (state, events, hooks) |
| Data fetching | Server Components fetch directly; use `cache()` for deduplication |
| Server Actions | Auth check FIRST; validate with Zod; return error objects, don't throw |
| Auth errors | `if (!user) return { error: 'Not authenticated' }` — never throw for expected failures |
| Metadata | `generateMetadata()` for per-page SEO; `metadata` export for static |

| Skill topic | Reference |
|-------------|-----------|
| App Router patterns | skills/SKILL.md#app-router |
| Server Actions | skills/SKILL.md#server-actions |
| Security | skills/SKILL.md#security |
| Testing | skills/SKILL.md#testing |
| Resilience + retries | skills/SKILL.md#resilience |
| Performance | skills/SKILL.md#performance |
