# CaseForge

CaseForge is evolving from an AI test case generator into a Jira-style QA management platform.

Current product areas in the repo:

- dashboard homepage
- project library
- project workspace
- project board
- project issues route
- Prisma-backed project and issue foundation

## Development

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Setup

Create a local `.env` file from [`.env.example`](./.env.example).

Required variables:

- `DATABASE_URL`
- `DIRECT_URL`
- `GROQ_API_KEY`

### Database URLs

Use:

- `DATABASE_URL` for the runtime app connection
- `DIRECT_URL` for Prisma CLI operations and migrations

For Neon/PostgreSQL, prefer:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB_NAME?sslmode=verify-full&channel_binding=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST/DB_NAME?sslmode=verify-full&channel_binding=require"
```

Why `verify-full`:

- it avoids the current `pg` SSL warning about `sslmode=require`
- it preserves the stricter behavior that the current driver stack already applies

After changing `.env`, restart the dev server.

## Prisma

Prisma config lives in [`prisma.config.ts`](./prisma.config.ts).

Notes:

- Prisma CLI uses `DIRECT_URL`
- application runtime uses `DATABASE_URL`
- migrations live in [`prisma/migrations`](./prisma/migrations)

Current repo state:

- a manual migration has been added for the Jira-style foundation
- issue CRUD services and routes are in place
- user-linked assignee support has started in the issues UI

### Common Prisma Commands

Use these scripts during local development:

```bash
npm run db:status
npm run db:generate
npm run db:migrate
npm run db:studio
```

Recommended order after schema changes:

1. run `npm run db:migrate`
2. run `npm run db:generate`
3. restart `npm run dev`

## CI Pipeline

GitHub Actions CI is configured in:

- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)

It runs automatically on every push to `main` and on pull requests, and checks:

1. `npm ci`
2. `npx prisma generate`
3. `npm run lint:strict`
4. `npm run typecheck`
5. `npm run build`

The workflow uses safe placeholder environment variables for:

- `DATABASE_URL`
- `DIRECT_URL`
- `GROQ_API_KEY`

That keeps CI focused on code health and build integrity without requiring live production secrets.

If Prisma reports missing engines or download issues, rerun the command with an active network connection so Prisma can fetch its required binaries.

## Current Route Shape

- `/` dashboard
- `/projects` project library
- `/projects/new` new workspace
- `/projects/[projectKey]` project workspace
- `/projects/[projectKey]/board` project board
- `/projects/[projectKey]/issues` project issues
- `/settings/users` user settings skeleton

## Secret Hygiene

Good practices for this repo:

- keep `.env` local only
- never commit live database credentials
- rotate credentials immediately if they were exposed outside your machine
- use `.env.example` for onboarding instead of sharing real values
