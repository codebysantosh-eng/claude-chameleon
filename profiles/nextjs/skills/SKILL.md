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
import { getServerSession } from 'next-auth';

export async function deletePost(postId: string) {
  // 1. Auth FIRST — before reading any data
  const session = await getServerSession();
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
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  // proceed
}
```

---

## testing

### Testing Server Components

```tsx
// Use React's renderToString or test the data fetching logic separately
import { render } from '@testing-library/react';

// For async Server Components, wrap in a helper
async function renderServerComponent(component: JSX.Element) {
  const html = await renderToString(component);
  return parse(html); // use html-react-parser
}
```

### Testing with @testing-library/react

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('shows error when email is invalid', async () => {
  const user = userEvent.setup();
  render(<LoginForm />);

  await user.type(screen.getByLabelText('Email'), 'notanemail');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Invalid email');
});
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
