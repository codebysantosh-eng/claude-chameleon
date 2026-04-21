# Active Stack: Next.js (App Router)
COMMANDS: test=npx vitest run | lint=npx eslint . --ext .ts,.tsx,.js,.jsx | format=npx prettier --write . | typecheck=npx tsc --noEmit | build=next build | audit=npm audit --production | e2e=npx playwright test
FILES: app/**/*.tsx, app/**/*.ts, **/*.tsx
FORBIDDEN: NEXT_PUBLIC_ on server secrets | useEffect for data fetching (use RSC) | console.log → Pino | Client Component by default (Server Component first)
