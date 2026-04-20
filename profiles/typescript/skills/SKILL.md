# TypeScript Skills

Deep reference for TypeScript development patterns. Load specific sections on demand.

---

## testing

### Unit tests with Vitest

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('calculateDiscount', () => {
  it('returns 10% discount for members', () => {
    expect(calculateDiscount(100, { isMember: true })).toBe(90);
  });

  it('returns 0 discount for non-members', () => {
    expect(calculateDiscount(100, { isMember: false })).toBe(100);
  });

  it('throws for negative amounts', () => {
    expect(() => calculateDiscount(-1, { isMember: true })).toThrow('Amount must be positive');
  });
});
```

### Mocking with vi.mock

```typescript
vi.mock('../lib/database', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('returns null when user not found', async () => {
  vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);
  const result = await getUserById('nonexistent');
  expect(result).toBeNull();
});
```

### Test data factories

```typescript
import { faker } from '@faker-js/faker';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    createdAt: new Date(),
    ...overrides,
  };
}

// Use in tests:
const user = buildUser({ email: 'test@example.com' });
```

### Integration test pattern (API endpoint)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('POST /api/users', () => {
  beforeEach(async () => {
    // Reset DB state before each test
    await db.user.deleteMany();
  });

  it('creates a user and returns 201', async () => {
    const response = await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@example.com', name: 'New User' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.email).toBe('new@example.com');
  });
});
```

### Coverage config (vitest.config.ts)

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
```

---

## security

### Input validation with Zod

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['user', 'admin']).default('user'),
});

// Validate at every boundary
export async function createUser(rawInput: unknown) {
  const input = CreateUserSchema.parse(rawInput); // throws ZodError on invalid
  // ... proceed with typed, validated input
}
```

### Auth check pattern

```typescript
// Always check auth BEFORE doing anything
export async function deletePost(postId: string, userId: string) {
  const user = await getAuthenticatedUser(userId);
  if (!user) throw new UnauthorizedError('Not authenticated');

  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post) throw new NotFoundError('Post not found');

  // Resource-level authorization (not just authentication)
  if (post.authorId !== user.id && user.role !== 'admin') {
    throw new ForbiddenError('Not your post');
  }

  await db.post.delete({ where: { id: postId } });
}
```

### Never expose internals in errors

```typescript
// ✗ Bad — leaks DB schema and internal details
catch (err) {
  return res.status(500).json({ error: err.message });
}

// ✓ Good — generic user message, detailed server log
catch (err) {
  logger.error({ err, userId, postId }, 'Failed to delete post');
  return res.status(500).json({ error: 'Failed to delete post. Please try again.' });
}
```

### JWT token storage

```typescript
// ✗ Bad — XSS can steal localStorage tokens
localStorage.setItem('token', jwt);

// ✓ Good — httpOnly cookie inaccessible to JavaScript
res.setHeader('Set-Cookie', serialize('token', jwt, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60, // 1 hour
  path: '/',
}));
```

---

## coding-standards

### Guard clauses (avoid deep nesting)

```typescript
// ✗ Bad
function processOrder(order: Order) {
  if (order) {
    if (order.items.length > 0) {
      if (order.user.isVerified) {
        // actual work buried at level 4
      }
    }
  }
}

// ✓ Good — guard clauses keep the happy path flat
function processOrder(order: Order) {
  if (!order) throw new Error('Order required');
  if (order.items.length === 0) throw new Error('Order must have items');
  if (!order.user.isVerified) throw new ForbiddenError('User not verified');

  // happy path at level 1
}
```

### Options object for > 3 params

```typescript
// ✗ Bad
function sendEmail(to: string, subject: string, body: string, cc?: string, bcc?: string) {}

// ✓ Good
function sendEmail(options: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}) {}
```

### Custom error types

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 'UNAUTHORIZED', 401);
  }
}
```

### Parallel async operations

```typescript
// ✗ Bad — sequential, slow
const user = await fetchUser(id);
const orders = await fetchOrders(id);
const preferences = await fetchPreferences(id);

// ✓ Good — parallel when independent
const [user, orders, preferences] = await Promise.all([
  fetchUser(id),
  fetchOrders(id),
  fetchPreferences(id),
]);

// Use allSettled when partial failure is acceptable
const results = await Promise.allSettled([fetchUser(id), fetchOrders(id)]);
```

---

## observability

### Structured logging with Pino

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty' },
  }),
});

// Request-scoped child logger (adds requestId to every log)
export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}
```

### What to log

```typescript
// Business event (info level)
logger.info({ userId, orderId, amount }, 'Order placed successfully');

// Failure with context (error level)
logger.error({ err, userId, postId }, 'Failed to delete post');

// Performance signal (debug level)
logger.debug({ durationMs: end - start, queryCount }, 'DB query complete');

// NEVER log:
// - passwords, tokens, API keys
// - full PII (hash or redact)
// - full error stack traces to users (server-side only)
```

### Request correlation pattern

```typescript
// middleware: assign requestId at the edge
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  req.logger = logger.child({ requestId: req.requestId });
  next();
});

// in handlers: use req.logger, not the root logger
app.get('/users/:id', async (req, res) => {
  req.logger.info({ userId: req.params.id }, 'Fetching user');
  // ...
});
```
