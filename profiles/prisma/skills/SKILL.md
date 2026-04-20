# Prisma ORM Skills

Deep reference for Prisma patterns. Load specific sections on demand.

---

## schema

### Model conventions

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users") // snake_case DB table name
  @@index([email]) // index fields used in where/orderBy
}

enum Role {
  USER
  ADMIN
}
```

### Relations

```prisma
model Post {
  id       String @id @default(cuid())
  title    String
  content  String
  authorId String
  author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([authorId]) // always index foreign keys
}
```

---

## migrations

### Development workflow

```bash
# After changing schema.prisma:
npx prisma generate          # update TypeScript client
npx prisma migrate dev       # create + apply migration
npx prisma migrate dev --name add_user_role  # named migration
```

### Breaking changes: expand-contract pattern

Never rename a column or table in a single migration — it drops data.

```
Step 1 — Expand: Add the new column, keep the old one
  ALTER TABLE users ADD COLUMN full_name TEXT;

Step 2 — Migrate data: Backfill new column from old
  UPDATE users SET full_name = name;

Step 3 — Update code: Write to both columns, read from new

Step 4 — Contract: Remove old column once code is deployed
  ALTER TABLE users DROP COLUMN name;
```

### Production deployment

```bash
# In CI/CD — never migrate dev in production
npx prisma migrate deploy

# Verify migration status
npx prisma migrate status
```

---

## queries

### Basic CRUD

```typescript
// Create
const user = await db.user.create({
  data: { email, name },
});

// Read with select (prefer over include for performance)
const user = await db.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true }, // never select * in production
});

// Update
const updated = await db.user.update({
  where: { id },
  data: { name },
});

// Delete
await db.user.delete({ where: { id } });
```

### Transactions (use for any multi-step write)

```typescript
const [post, _] = await db.$transaction([
  db.post.create({ data: { title, authorId } }),
  db.user.update({ where: { id: authorId }, data: { postCount: { increment: 1 } } }),
]);

// Interactive transaction (when you need results from earlier operations)
const result = await db.$transaction(async (tx) => {
  const user = await tx.user.findUniqueOrThrow({ where: { id } });
  if (user.balance < amount) throw new Error('Insufficient balance');
  return tx.user.update({
    where: { id },
    data: { balance: { decrement: amount } },
  });
}, {
  maxWait: 5000,
  timeout: 10000,
  isolationLevel: 'Serializable', // for financial operations
});
```

### Cursor-based pagination (preferred over offset)

```typescript
async function getPosts(cursor?: string, take = 20) {
  const posts = await db.post.findMany({
    take: take + 1,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: 'desc' },
  });

  const hasNextPage = posts.length > take;
  return {
    posts: hasNextPage ? posts.slice(0, -1) : posts,
    nextCursor: hasNextPage ? posts[take - 1].id : null,
  };
}
```

---

## testing

### Reset DB between tests

```typescript
// Reset in dependency order (children before parents)
beforeEach(async () => {
  await db.post.deleteMany();
  await db.user.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});
```

### Mock Prisma for unit tests

```typescript
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { PrismaClient } from '@prisma/client';

vi.mock('../lib/db', () => ({ db: mockDeep<PrismaClient>() }));

beforeEach(() => {
  mockReset(db);
});

it('returns user when found', async () => {
  const mockUser = buildUser();
  vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser);

  const result = await getUserById(mockUser.id);
  expect(result).toEqual(mockUser);
});
```

---

## performance

### Connection pooling (mandatory for serverless)

```typescript
// lib/db.ts — singleton pattern to reuse connections
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query'] : [],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

For serverless (Vercel, Lambda): use Prisma Accelerate or PgBouncer. Direct connections exhaust the DB connection pool.

### Avoid N+1 queries

```typescript
// ✗ Bad — N+1 (1 query for posts + N queries for authors)
const posts = await db.post.findMany();
for (const post of posts) {
  const author = await db.user.findUnique({ where: { id: post.authorId } }); // N queries!
}

// ✓ Good — 1 query with join
const posts = await db.post.findMany({
  include: { author: { select: { id: true, name: true } } },
});
```

### Select only needed fields

```typescript
// ✗ Bad — transfers all columns
const users = await db.user.findMany();

// ✓ Good — transfers only what's needed
const users = await db.user.findMany({
  select: { id: true, email: true, name: true },
});
```
