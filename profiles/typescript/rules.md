# Active Stack: TypeScript
COMMANDS: test=npx vitest run | lint=npx eslint . | format=npx prettier --write . | typecheck=npx tsc --noEmit | build=npm run build | audit=npm audit --production
FILES: **/*.ts, **/*.tsx
FORBIDDEN: any → unknown or proper type | console.log → structured logger (Pino/Winston) | mutation → immutable patterns
