# Next.js App Router Skills

Deep reference for Next.js 14+ App Router patterns. Load specific sections on demand.

---

## app-router

### Server vs Client Components

```tsx
// Server Component (default) — async, direct DB access, zero client JS
// app/users/page.tsx
export default async function UsersPage() {
  const users = await db.user.findMany(); // direct DB access OK
  return <UserList users={users} />;
}

// Client Component — explicit opt-in, needed for state/events/hooks
// components/UserSearch.tsx
'use client';
import { useState } from 'react';

export function UserSearch() {
  const [query, setQuery] = useState('');
  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
```

### Composition rule: Server wraps Client, not the other way

```tsx
// ✓ Good — Server Component wraps Client Component, passes data as props
export default async function Page() {
  const data = await fetchData();
  return <ClientComponent data={data} />;
}

// ✓ Good — pass Server Components as children to Client Components
export default async function Layout({ children }: { children: React.ReactNode }) {
  return <ClientShell>{children}</ClientShell>;
}

// ✗ Bad — Client Component cannot import a Server Component
'use client';
import ServerComponent from './ServerComponent'; // Error in Next.js
```

### Data fetching patterns

```tsx
// Parallel data fetching
export default async function Page() {
  const [user, posts] = await Promise.all([
    fetchUser(id),
    fetchPosts(id),
  ]);
  return <Profile user={user} posts={posts} />;
}

// Deduplicate requests with cache()
import { cache } from 'react';
export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});

// ISR — revalidate every hour
export const revalidate = 3600;

// Force dynamic for real-time data
export const dynamic = 'force-dynamic';
```

### File conventions

| File | Purpose |
|------|---------|
| `page.tsx` | Route UI, exported as default |
| `layout.tsx` | Persistent wrapper (nav, sidebar) |
| `loading.tsx` | Suspense skeleton for the route |
| `error.tsx` | Error boundary for the route |
| `not-found.tsx` | 404 page (trigger with `notFound()`) |
| `route.ts` | API route handler (GET, POST, etc.) |

---

## server-actions

### Auth check FIRST — always

```tsx
// app/actions/post.ts
'use server';
import { auth } from '@/auth'; // Auth.js v5 — replaces getServerSession

export async function deletePost(postId: string) {
  // 1. Auth FIRST — before reading any data
  const session = await auth();
  if (!session) return { error: 'Not authenticated' };

  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post) return { error: 'Post not found' };

  // 2. Authorization — resource level
  if (post.authorId !== session.user.id) return { error: 'Not your post' };

  // 3. Validate input
  const parsed = DeletePostSchema.safeParse({ postId });
  if (!parsed.success) return { error: 'Invalid input' };

  await db.post.delete({ where: { id: postId } });
  revalidatePath('/posts');
  return { success: true };
}
```

### useActionState hook (React 19 / Next.js 14+)

```tsx
'use client';
import { useActionState } from 'react';
import { deletePost } from '../actions/post';

export function DeleteButton({ postId }: { postId: string }) {
  const [state, action, isPending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      return deletePost(formData.get('postId') as string);
    },
    null,
  );

  return (
    <form action={action}>
      <input type="hidden" name="postId" value={postId} />
      <button disabled={isPending} type="submit">
        {isPending ? 'Deleting...' : 'Delete'}
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

### Return error objects, don't throw for expected failures

```tsx
// ✓ Good — expected failures are return values, not exceptions
export async function createPost(formData: FormData) {
  const parsed = PostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  // ...
  return { success: true };
}

// ✗ Bad — throwing for expected failures breaks form UX
export async function createPost(formData: FormData) {
  const data = PostSchema.parse(Object.fromEntries(formData)); // throws ZodError
  // caller must catch — awkward in useActionState
}
```

---

## security

### NEXT_PUBLIC_ rules

```bash
# ✓ Safe — public data (analytics ID, public API URL)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
NEXT_PUBLIC_API_URL=https://api.example.com

# ✗ FORBIDDEN — server-only secrets exposed to browser
NEXT_PUBLIC_DATABASE_URL=postgres://...    # browser can read this!
NEXT_PUBLIC_STRIPE_SECRET_KEY=sk_live_... # exposed in page source!
NEXT_PUBLIC_JWT_SECRET=...                # compromises all auth tokens!
```

### Route handler auth

```typescript
// app/api/admin/route.ts
import { auth } from '@/auth'; // Auth.js v5

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  // proceed
}
```

---

## testing

### Server Components — test the logic, not the rendering

There is no stable way to unit-test async React Server Components directly. Use two strategies instead:

**Strategy 1 — test the data layer in isolation** (covers most logic):
```typescript
// lib/posts.ts — pure async function, testable without React
export async function getPost(id: string) {
  return db.post.findUnique({ where: { id }, include: { author: true } });
}

// __tests__/lib/posts.test.ts
import { getPost } from '@/lib/posts';
it('returns null for missing post', async () => {
  await expect(getPost('missing-id')).resolves.toBeNull();
});
```

**Strategy 2 — Playwright for integration** (covers the full RSC render path):
```typescript
// e2e/post-page.spec.ts
import { test, expect } from '@playwright/test';
test('post page renders title', async ({ page }) => {
  await page.goto('/posts/1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Post');
});
```

### Client Components with @testing-library/react

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('shows error when email is invalid', async () => {
  const user = userEvent.setup();
  render(<LoginForm />);

  await user.type(screen.getByLabelText('Email'), 'notanemail');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Invalid email');
});
```

### Server Actions — test via Playwright or by calling the action directly

```typescript
// app/actions/post.ts exports a plain async function — call it directly in tests
import { deletePost } from '@/app/actions/post';

it('rejects unauthenticated delete', async () => {
  // mock auth() to return null (Auth.js v5)
  vi.mock('@/auth', () => ({ auth: vi.fn(() => null) }));
  const result = await deletePost('post-1');
  expect(result).toEqual({ error: 'Not authenticated' });
});
```

---

## resilience

### fetch with timeout (AbortController)

```typescript
// lib/fetch.ts
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}
```

### Exponential backoff for external API calls

```typescript
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  { retries = 3, baseDelayMs = 200 }: { retries?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      // Only retry on network errors and 5xx; never on 4xx
      if (err instanceof Error && err.name === 'AbortError') throw err;
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  throw new Error('unreachable');
}
```

### Route-level error boundary with logging

```tsx
// app/dashboard/error.tsx — catches errors thrown in this route segment
'use client';
import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Send to your error tracking service (Sentry.captureException, Datadog, etc.)
    reportError(error);
  }, [error]);

  return (
    <div role="alert">
      <p>Something went wrong.</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

### next.config.js — recommended production settings

```javascript
// next.config.js
module.exports = {
  experimental: {
    serverActionsBodySizeLimit: '2mb', // increase for file upload actions
  },
  async headers() {
    return [{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }];
  },
};
```

---

## performance

### next/image — always specify sizes

```tsx
// ✗ Bad — browser downloads full image, can't optimize
<img src="/hero.jpg" alt="Hero" />

// ✓ Good — optimized, lazy loaded, prevents layout shift
import Image from 'next/image';
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  sizes="(max-width: 768px) 100vw, 1200px"
  priority // for LCP images above the fold
/>
```

### Dynamic imports for heavy Client Components

```tsx
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('../components/HeavyChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false, // if the component doesn't need SSR
});
```

### Metadata for SEO

```tsx
// Static metadata
export const metadata = {
  title: 'My App',
  description: 'App description',
};

// Dynamic metadata per page
export async function generateMetadata({ params }: { params: { id: string } }) {
  const post = await getPost(params.id);
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { title: post.title, images: [post.coverImage] },
  };
}
```
