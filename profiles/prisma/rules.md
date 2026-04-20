# Active Stack: Prisma (ORM)
COMMANDS: migrate=npx prisma migrate dev | deploy=npx prisma migrate deploy | generate=npx prisma generate | studio=npx prisma studio
FILES: prisma/**/*.prisma, **/*.prisma
FORBIDDEN: raw SQL without parameterization | mutations without transaction (multi-step ops) | connect pooling disabled in serverless
