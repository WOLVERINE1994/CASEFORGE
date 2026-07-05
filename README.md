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
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CASEFORGE_ALLOWED_EMAILS`

Optional / upcoming variables:

- `NEXT_PUBLIC_APP_URL`
- `CASEFORGE_OWNER_EMAILS`
- `CASEFORGE_ACCESS_REQUEST_EMAIL_TO`
- `CASEFORGE_EMAIL_FROM`
- `RESEND_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

### Database URLs

Use Supabase Postgres connection strings:

- `DATABASE_URL` for the runtime app connection
- `DIRECT_URL` for Prisma CLI operations and migrations

For Supabase/PostgreSQL, prefer SSL-enabled URLs:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB_NAME?sslmode=verify-full&channel_binding=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST/DB_NAME?sslmode=verify-full&channel_binding=require"
```

Why `verify-full`:

- it avoids the current `pg` SSL warning about `sslmode=require`
- it preserves the stricter behavior that the current driver stack already applies

After changing `.env`, restart the dev server.

### Authentication

CaseForge uses Clerk authentication, matching the NoteGenie project pattern:

- `ClerkProvider` is wired in [`app/layout.tsx`](./app/layout.tsx)
- sign-in, sign-up, and the user menu live in [`components/AuthTopbar.tsx`](./components/AuthTopbar.tsx)
- protected workspace and API routes are guarded in [`proxy.ts`](./proxy.ts)

The dashboard route keeps a signed-out welcome screen, then loads project data only after Clerk returns a signed-in user.

CaseForge also has a private beta access gate on top of Clerk. Set
`CASEFORGE_ALLOWED_EMAILS` to a comma-separated list of approved emails, for
example `owner@example.com,teammate@example.com`. You can also set
`CASEFORGE_ALLOWED_DOMAINS` for an approved company domain. Signed-in users who
are not approved are redirected to `/access-pending`, and denied attempts are
logged on the server as `CASEFORGE_ACCESS_DENIED`. In production, an empty
allowlist fails closed so the workspace does not open by accident.

Access requests are stored in the `AccessRequest` table and can be reviewed at
`/access-requests` by the owner. Set `CASEFORGE_OWNER_EMAILS` to the email
allowed to administer requests. When `RESEND_API_KEY` is configured, CaseForge
emails approval/rejection links to `CASEFORGE_ACCESS_REQUEST_EMAIL_TO`; otherwise
requests are still stored in the app for manual review.

### Vercel + Supabase Deployment

Before deploying on Vercel:

1. Create or choose a Supabase project.
2. Copy the Supabase Postgres connection strings into Vercel as `DATABASE_URL` and `DIRECT_URL`.
3. Add `GROQ_API_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CASEFORGE_ALLOWED_EMAILS`, `CASEFORGE_OWNER_EMAILS`, and optionally `RESEND_API_KEY` in Vercel project environment variables.
4. Run Prisma migrations against Supabase:

```bash
npm run db:deploy
npm run db:generate
```

5. Deploy the Next.js app on Vercel.

Razorpay variables are reserved in [`.env.example`](./.env.example) for the later billing phase.

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
