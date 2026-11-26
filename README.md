# FitFlow

Gym management SaaS for Indian gyms. Many gyms sign up, and each one manages its members,
renewals, GST billing, attendance, trainers and staff, with its data kept separate from
every other gym.

**Status:** Phase 0 (foundation) is done: monorepo, database, multi-gym isolation, login,
roles and permissions, audit log, and a working Members module in the admin web panel.
See [the roadmap](#roadmap) for what comes next.

**Docs:** [CLAUDE.md](CLAUDE.md) (code map, architecture rules, how to add a module) ·
[PLAN.md](PLAN.md) (full product plan and phase status) ·
[docs/SECURITY.md](docs/SECURITY.md) (security controls and production checklist).

## Repository layout

```
apps/
  api/       NestJS REST API (Swagger at /docs)
  web/       Next.js admin panel for gym owners and staff
  mobile/    Expo member + trainer app (Phase 2, placeholder)
packages/
  db/        Prisma schema, migrations, seed, tenant-isolation helpers
  shared/    Zod schemas, types, permissions and roles used by every app
  ui/        Shared React components (Tailwind CSS)
  config/    TypeScript and ESLint presets
infra/       docker-compose (PostgreSQL, Redis, MinIO) and the database init script
```

## Getting started

Requirements: Node.js 20.19+ and pnpm (`corepack enable` installs the right version).

```bash
pnpm install
cp .env.example .env          # then set JWT_ACCESS_SECRET to a long random string

# Start PostgreSQL, pick one:
docker compose -f infra/docker-compose.yml up -d   # with Docker
pnpm db:embedded                                    # without Docker (leave it running)

pnpm db:deploy                # apply migrations
pnpm db:seed                  # demo gym + logins
pnpm dev                      # API on :4000, web on :3000
```

Open http://localhost:3000 and sign in with gym ID `demo`:

| Role         | Email                        | Password  |
| ------------ | ---------------------------- | --------- |
| Owner        | owner@demo.fitflow.local     | Demo@1234 |
| Receptionist | frontdesk@demo.fitflow.local | Demo@1234 |

API docs: http://localhost:4000/docs. Member OTP codes are printed in the API console
in development (`OTP_PROVIDER=log`).

## Commands

| Command                                      | What it does                                                        |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                                   | Run API and web in watch mode                                       |
| `pnpm build` / `lint` / `typecheck` / `test` | Checks run in CI                                                    |
| `pnpm test:e2e`                              | API end-to-end tests (needs the database running and migrated)      |
| `pnpm db:migrate`                            | Create a migration after editing `packages/db/prisma/schema.prisma` |
| `pnpm db:studio`                             | Browse the database                                                 |

## How multi-gym isolation works

Every gym-owned table has a `gymId` column, and isolation is enforced in two places:

1. **In the app:** `TenantDbService` (API) gives each request a Prisma client that adds the
   caller's `gymId` to every query and refuses to touch another gym's rows.
2. **In PostgreSQL:** row-level-security policies only return rows for the gym set on the
   current transaction. Queries with no gym set return nothing.

The app must connect as the non-superuser `fitflow` role from `infra/postgres/init.sql`,
because superusers ignore row-level security. The API logs a warning at startup if it isn't.

**Adding a gym-owned table:** give it a `gymId`, add the model to `TENANT_MODELS` in
`packages/db/src/tenancy.ts`, and enable RLS for it in the migration (copy the pattern in
`packages/db/prisma/migrations/*_rls`). Copy `apps/api/src/members` for the module itself.

## Roadmap

| Phase               | Scope                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Foundation ✅     | Monorepo, auth (password + OTP), roles, tenant isolation, audit log, members                                                                         |
| 1 Front desk        | Plans, renewals and freezes, GST invoices, payments and Razorpay links, QR/manual check-in, enquiries, WhatsApp/SMS reminders, dashboard and reports |
| 2 Mobile & training | Member + trainer app, workout and diet plans, progress, classes, PT packages                                                                         |
| 3 Operations        | Biometric devices, staff HR and payroll, POS and inventory, expenses, multi-branch reports                                                           |
| 4 SaaS layer        | Super-admin console, FitFlow pricing tiers and billing, self-serve signup                                                                            |
