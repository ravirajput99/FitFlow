# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo. Read this first, then
[PLAN.md](PLAN.md) for the product scope and what to build next, and
[docs/SECURITY.md](docs/SECURITY.md) before touching auth, tenancy or the web proxy.

## What this is

**FitFlow** is a multi-gym SaaS for Indian gyms. Many gyms sign up; each manages its
members, plans and renewals, GST billing, attendance, enquiries, trainers and staff. Every
gym's data is isolated from every other gym's. India-first: INR in paise, GST, Razorpay/UPI,
WhatsApp + SMS (MSG91), +91 mobile numbers.

**Status:** Phase 0 (foundation) is done. Phase 1 (front desk) is next. See PLAN.md.

## Stack (pinned versions, do not bump majors casually)

pnpm 10 workspaces + Turborepo · NestJS 11 · Prisma 6 + PostgreSQL 16 · Next.js 15 (App
Router) + React 19 · Tailwind 4 · TanStack Query 5 · react-hook-form + Zod 4 · Jest 29 +
Supertest · TypeScript 5.9 · Node ≥ 20.19. Mobile (Phase 2) will be Expo.

## Setup and run

```bash
corepack enable                 # once: provides the pinned pnpm
pnpm install
cp .env.example .env            # set JWT_ACCESS_SECRET to a long random string

# PostgreSQL, pick one:
docker compose -f infra/docker-compose.yml up -d   # Docker: Postgres + Redis + MinIO
pnpm db:embedded                                    # no Docker: Postgres from npm, keep running

pnpm db:deploy                  # apply migrations
pnpm db:seed                    # demo gym + logins (refuses to run with NODE_ENV=production)
pnpm dev                        # API http://localhost:4000 (Swagger /docs), web http://localhost:3000
```

Demo logins (gym ID `demo`, password `Demo@1234`): `owner@demo.fitflow.local` (Owner),
`frontdesk@demo.fitflow.local` (Receptionist). Super-admin: `admin@fitflow.local` /
`ChangeMe@123` (leave gym ID empty). In dev, member OTP codes print in the API console.

## Commands

| Command                                                     | Purpose                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                                                  | API + web in watch mode                                      |
| `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` | What CI runs (unit tests need no DB)                         |
| `pnpm test:e2e`                                             | API e2e tests; needs Postgres running and migrated           |
| `pnpm --filter @fitflow/api test:e2e security`              | Run one e2e file (Jest path pattern)                         |
| `pnpm db:migrate`                                           | After editing `schema.prisma`: creates + applies a migration |
| `pnpm db:generate`                                          | Regenerate the Prisma client                                 |
| `pnpm db:studio`                                            | Browse the DB                                                |
| `pnpm format`                                               | Prettier over the repo                                       |

Before finishing any change run `pnpm typecheck && pnpm lint && pnpm test`, plus
`pnpm test:e2e` if you touched the API or DB.

## Repo map

```
apps/api/src/                    NestJS API (all routes under /v1, except /health and /docs)
  main.ts                        bootstrap
  app.factory.ts                 shared setup (trust proxy, helmet, CORS, prefix, Swagger) used by main + e2e
  app.module.ts                  module wiring, global throttler config, Prisma error filter
  config/env.ts                  Zod-validated env; production safety checks live here
  common/request-context.ts      AsyncLocalStorage per request: userId, gymId, permissions, ip
  common/zod.ts                  ZodPipe (validate with shared schemas) + Swagger helpers
  common/throttler.guard.ts      global rate limit: per user when logged in, else per IP
  common/prisma-exception.filter.ts  P2002→409, P2025→404, P2003→400, tenant violation→403
  prisma/prisma.service.ts       raw PrismaClient + `.system` (RLS-bypass) client
  prisma/tenant-db.service.ts    `db.client` (gym-scoped) and `db.transaction()` for the current request
  auth/                          login, OTP, refresh, logout, me; JWT + permission guards; decorators
  audit/audit.service.ts         `audit.record({...}, tx?)`: who changed what
  members/                       REFERENCE MODULE: copy this for every new gym-scoped feature
  health/                        GET /health (DB ping)
apps/api/test/                   e2e: auth, tenancy (incl. raw-SQL RLS checks), members-rbac, security
apps/web/src/
  middleware.ts                  redirects to /login when there is no session cookie
  app/login/page.tsx             staff login
  app/(app)/                     signed-in area: layout (AppShell), dashboard, members list/new/[id]
  app/api/auth/{login,logout}    BFF: sets/clears httpOnly cookies ff_at / ff_rt
  app/api/v1/[...path]/route.ts  BFF proxy to the API: attaches token, refreshes, CSRF + size checks
  lib/server/session.ts          cookie helpers, refresh de-duplication, body limit, client-IP forwarding
  lib/api-client.ts              browser fetch wrapper (`api()`, `ApiError` with field issues)
  lib/use-me.ts                  `useMe()` current user, `useCan(permission)` for UI gating
  components/app-shell.tsx       sidebar nav ("soon" items = future modules)
  components/member-form.tsx     RHF + Zod form pattern (server field errors mapped back)
packages/db/
  prisma/schema.prisma           data model (money in paise, GST in basis points)
  prisma/migrations/             *_init, *_rls (row-level security, hand-written), *_login_lockout
  prisma/seed.ts                 idempotent demo data
  src/tenancy.ts                 forTenant / tenantTransaction / asSystem / systemTransaction, TENANT_MODELS
  src/provision.ts               provisionGym(): gym + system roles + main branch + owner
  scripts/embedded-postgres.mts  Docker-free Postgres for dev
packages/shared/src/             used by API, web and (later) mobile; built with tsup
  permissions.ts                 PERMISSIONS catalog (e.g. members.read)
  roles.ts                       SYSTEM_ROLES: OWNER, MANAGER, RECEPTIONIST, TRAINER, MEMBER
  phone.ts                       normalizeIndianMobile → +91XXXXXXXXXX
  schemas/{common,auth,member}.ts  Zod schemas + DTO types (single source of validation)
packages/ui/src/                 Button, Input/Select/Textarea/Field, Card, Badge (TS source, Tailwind)
packages/config/                 tsconfig presets + ESLint configs (base / nest / react)
infra/                           docker-compose (dev only), postgres/init.sql (creates non-superuser role)
.github/workflows/ci.yml         CI: build, lint, typecheck, unit + e2e on Postgres 16
```

## Architecture rules (do not break these)

### Multi-tenancy: two layers, both required

1. **App layer:** in API feature code use `TenantDbService`:
   - `this.db.client.<model>...` auto-adds `gymId` to where/data for models in `TENANT_MODELS`.
   - `this.db.transaction(async (tx) => ...)` for multi-step writes. Inside `tx`, gymId is
     **not** auto-injected: pass `gymId: this.db.gymId` explicitly in where/data. RLS still applies.
2. **DB layer:** PostgreSQL RLS (`FORCE ROW LEVEL SECURITY`) on every tenant table. Policy
   checks `app.gym_id` (set per transaction) or `app.bypass_rls = 'on'`. No setting → no rows.

- The app **must** connect as the non-superuser `fitflow` role (`infra/postgres/init.sql`).
  Superusers and BYPASSRLS roles silently skip RLS; the API warns at startup.
- `PrismaService.system` / `systemTransaction` bypass RLS. Use them only for auth lookups,
  provisioning, super-admin and background jobs. Never in normal gym feature code.
- **Foreign-key checks bypass RLS.** If a request supplies an ID of another record
  (branchId, planId, memberId…), verify it belongs to the caller's gym with the tenant client
  first (see `assertBranch` in `members.service.ts`).

### Adding a gym-scoped module (checklist)

1. `schema.prisma`: model with `gymId String` + relation to `Gym` (onDelete Cascade) + `@@index([gymId])`.
2. `pnpm db:migrate`, then add a **hand-written** migration enabling RLS for the table: copy
   the `ENABLE`/`FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy from `*_rls/migration.sql`.
3. Add the model name to `TENANT_MODELS` in `packages/db/src/tenancy.ts`.
4. Zod schemas + DTO types in `packages/shared/src/schemas/<thing>.ts`, export from `index.ts`.
   New permissions go in `permissions.ts` and the right roles in `roles.ts`. Existing gyms keep
   their stored role permissions, so a data migration may be needed.
5. API module: copy `apps/api/src/members/` (controller with `@RequirePermissions`, `ZodPipe`,
   `ApiZodBody`; service using `TenantDbService`; mapper to DTO; `audit.record` on every write).
6. e2e tests: happy path, RBAC (403 for a role without the permission), and cross-gym
   isolation (gym B gets 404 for gym A's IDs). Pattern in `test/tenancy.e2e-spec.ts`.
7. Web: pages under `apps/web/src/app/(app)/<thing>/`, call `api()` from `lib/api-client.ts`,
   reuse the shared Zod schema in the form, gate buttons with `useCan()`, flip `soon` off in `app-shell.tsx`.

### Auth and RBAC

- Global guards in order: `JwtAuthGuard` → `AppThrottlerGuard` → `PermissionsGuard`. Every
  route requires a login unless decorated `@Public()`. Use `@RequirePermissions(PERMISSIONS.X)`.
- Access token: JWT HS256, 15 min, payload `{ sub, gid, rk, perms, sa }`. Permission changes
  take effect at the next refresh (≤ 15 min).
- Refresh token: opaque `<id>.<secret>`, sha256 in DB, rotated on every use. Re-using a
  rotated token revokes all of that user's sessions.
- Staff log in with email + password (5 failures → 15-minute lock). Phone OTP login is
  allowed **only** for MEMBER and TRAINER roles. A member's first OTP login creates their user.
- Web: the browser never sees tokens. They live in httpOnly cookies, and Next route
  handlers proxy `/api/v1/*` to the API. Writes need a same-origin `Origin` header (CSRF).

### Validation and data conventions

- All request validation uses the Zod schemas in `@fitflow/shared` (`ZodPipe` on the API,
  `zodResolver` in forms). Never duplicate rules.
- Zod 4 gotcha: `.partial()` still applies `.default()`s. Build PATCH schemas from raw fields
  (see `memberUpdateSchema`). PATCH semantics: missing = unchanged, blank/null = clear.
- Money: integer **paise** (`pricePaise`). GST rates: basis points. Never floats.
- Phones: store E.164 `+91XXXXXXXXXX` via `indianMobileSchema`.
- Members are soft-deleted (`deletedAt`); always filter `deletedAt: null`.
- Member codes (`M0001`…) are allocated with a row lock on `Gym.nextMemberNumber` inside a transaction.
- Dates of birth etc. are date-only strings (`YYYY-MM-DD`) in DTOs.

### Security rules (details in docs/SECURITY.md)

- Never use `$queryRawUnsafe` / `$executeRawUnsafe` or string-built SQL. Use Prisma or tagged `$queryRaw`.
- Never return Prisma models directly; map to a DTO (no password hashes or internal fields).
- Don't log OTP codes, tokens, passwords or medical notes (the `log` OTP sender is dev-only
  and blocked in production).
- New public endpoints: add `@Public()` deliberately and a tight `@Throttle` if abusable
  (anything that sends SMS/WhatsApp/email or checks credentials).
- Bound every list (`pageSize` ≤ 100, `page` ≤ 10 000) and every string in Zod (`.max()`).

## Testing notes

- Unit: `node:test` in packages/shared and packages/db, Jest in apps/api (`*.spec.ts`).
- e2e (`apps/api/test`): boots the real `AppModule` via `createTestApp()`, uses the real DB,
  creates throwaway gyms (`createGym`) and deletes them after. `CapturingOtpSender` captures codes.
  `test/setup-env.ts` raises the rate limits for tests.
- Jest gives each test file its own `process.env`; `config/env.ts` loads `.env` manually for that reason.

## Gotchas

- `packages/shared` is consumed from `dist/`. Turbo builds it first; if types look stale, run `pnpm build --filter @fitflow/shared`.
- Prisma interactive transactions cannot run on an extended client: use `tenantTransaction` / `systemTransaction`, not `db.client.$transaction(async …)`.
- The web app reads the repo-root `.env` (see `next.config.ts`). There is no separate `apps/web/.env`.
- Rate-limit storage is in memory, so it is per API instance. Add a Redis store before running multiple instances.
- Windows: if `pnpm` is not found, run `corepack enable` from an admin shell.

## Working agreements

- Keep changes scoped to the task, and follow the members module's patterns.
- Don't commit or push unless asked. Branch off `main` first.
- Update PLAN.md status when a module ships, and this file when structure or rules change.
