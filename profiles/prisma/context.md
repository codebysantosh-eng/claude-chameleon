---
name: prisma
displayName: Prisma ORM
detectors:
  - file: prisma/schema.prisma
    weight: 4
  - file-contains: [package.json, "\"@prisma/client\""]
    weight: 3
  - glob: "prisma/migrations/**"
    weight: 2
threshold: 5
---

| Category | Tool | Notes |
|----------|------|-------|
| ORM | Prisma | Type-safe DB client; always run `prisma generate` after schema changes |
| Migrations | prisma migrate dev | Dev; `migrate deploy` for production |
| Studio | prisma studio | Visual DB browser |
| Connection pooling | Prisma Accelerate or PgBouncer | Required for serverless (Vercel, Lambda) |
| Transactions | `db.$transaction()` | Use for any multi-step write operation |

| Pattern | Rule |
|---------|------|
| Model naming | PascalCase singular (`User`, not `users`) |
| Fields | `@map` for snake_case DB columns |
| IDs | `@default(cuid(2))` or `@default(uuid(7))` (time-ordered, Prisma 5.14+) |
| Timestamps | Always include `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` |
| Indexes | `@@index([field])` for any column used in `.where()` or `.orderBy()` |
| Expand-contract | Breaking schema changes: add first, migrate, update code, drop old — never rename+deploy atomically |

| Skill topic | Reference |
|-------------|-----------|
| Schema design | skills/SKILL.md#schema |
| Migrations | skills/SKILL.md#migrations |
| Queries | skills/SKILL.md#queries |
| Testing | skills/SKILL.md#testing |
| Performance | skills/SKILL.md#performance |
