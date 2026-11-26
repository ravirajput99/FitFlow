# Security

How FitFlow protects gym data, what was reviewed, and what must be done before production.

## Threat model in one paragraph

FitFlow holds personal and health data (phones, addresses, dates of birth, medical notes)
for many gyms in one database, so the worst failures would be **one gym reading another gym's
data**, **account takeover** (especially gym owners), and **abuse that costs money or availability**
(SMS pumping, login floods). India's DPDP Act applies to this data.

## Controls in place

| Risk                                   | Control                                                                                                                                                                      | Where                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Cross-gym data access                  | Prisma extension injects `gymId`, and PostgreSQL RLS (FORCE) blocks other gyms' rows even for buggy queries. With no gym set, queries return nothing                         | `packages/db/src/tenancy.ts`, `migrations/*_rls`  |
| RLS silently off                       | App connects as non-superuser `fitflow` role; API warns at startup if the role bypasses RLS                                                                                  | `infra/postgres/init.sql`, `prisma.service.ts`    |
| SQL injection                          | Only Prisma queries and tagged `$queryRaw`/`$executeRaw` (parameterised). No `*Unsafe` raw SQL anywhere                                                                      | whole repo                                        |
| Mass assignment                        | Zod objects strip unknown keys; `gymId` can never come from the client                                                                                                       | `packages/shared/src/schemas`                     |
| API flooding                           | Global rate limit (`API_RATE_LIMIT`/min per user, or per IP when anonymous); public auth routes `AUTH_RATE_LIMIT`/min per IP; health check exempt                            | `common/throttler.guard.ts`, `auth.controller.ts` |
| Shared-IP lockout behind the web proxy | The BFF forwards the browser IP (`X-Forwarded-For`); the API trusts it only from `TRUST_PROXY` addresses                                                                     | `lib/server/session.ts`, `app.factory.ts`         |
| Password brute force                   | Per-IP limit + per-account lock: 5 wrong passwords → 15-minute lock                                                                                                          | `auth.service.ts`                                 |
| User enumeration                       | Same error for wrong gym/email/password; dummy bcrypt compare for unknown users; OTP request always returns 202                                                              | `auth.service.ts`                                 |
| OTP guessing                           | 6 digits, 5-minute expiry, 5 attempts per code taken **atomically** (parallel guesses can't exceed it), 5 codes/hour per phone, single use                                   | `auth.service.ts`                                 |
| Owner takeover via SIM swap            | Phone-OTP login only for MEMBER and TRAINER roles; staff with gym-wide access must use passwords                                                                             | `auth.service.ts`                                 |
| Stolen refresh token                   | Opaque, hashed, rotated on each use; reuse revokes every session for that user                                                                                               | `tokens.service.ts`                               |
| JWT forgery / alg confusion            | HS256 pinned for sign and verify, issuer checked, secret ≥ 32 chars, example secret refused in production                                                                    | `auth.module.ts`, `config/env.ts`                 |
| Removed member keeps access            | Removing a member disables their app login and revokes their sessions                                                                                                        | `members.service.ts`                              |
| Token theft via XSS                    | Tokens only in httpOnly, SameSite=Lax, Secure (prod) cookies; the browser never sees them                                                                                    | `lib/server/session.ts`                           |
| CSRF                                   | Writes through the BFF require a same-origin `Origin` header, plus SameSite cookies                                                                                          | `isSameOrigin()`                                  |
| Proxy abuse                            | BFF rejects `.`/`..` path segments, caps request bodies at 100 KB (413), returns only body + content-type from the API                                                       | `app/api/v1/[...path]/route.ts`                   |
| Clickjacking, sniffing                 | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS in production (web); helmet (API)                                | `next.config.ts`, `app.factory.ts`                |
| Open redirect after login              | `next` param must be a same-site path (`/x`, not `//x`)                                                                                                                      | `app/login/page.tsx`                              |
| Deep-paging DoS                        | `pageSize` ≤ 100, `page` ≤ 10 000, search ≤ 100 chars                                                                                                                        | `schemas/common.ts`, `schemas/member.ts`          |
| Information leaks                      | Swagger off in production by default; DB errors return generic messages (logged server-side); DTO mappers never expose password hashes                                       | `app.factory.ts`, `prisma-exception.filter.ts`    |
| Dev settings in production             | Env validation refuses `OTP_PROVIDER=log`, the example JWT secret and `TRUST_PROXY=true` in production; seed refuses `NODE_ENV=production`; compose ports bound to 127.0.0.1 | `config/env.ts`, `seed.ts`, `docker-compose.yml`  |
| Audit                                  | Every member create/update/delete is logged with actor, before/after, IP and user agent                                                                                      | `audit.service.ts`                                |

The `security`, `tenancy`, `auth` and `members-rbac` e2e suites in `apps/api/test/` prove most of the above.

## Production checklist

- [ ] `NODE_ENV=production`, a random `JWT_ACCESS_SECRET` (`openssl rand -base64 48`) in a secret manager.
- [ ] Database user is the non-superuser `fitflow` role (no BYPASSRLS); migrations run with an owner role if needed.
- [ ] TLS everywhere; the web app sits behind a load balancer or reverse proxy that **appends** to `X-Forwarded-For`, and Next.js is not reachable directly.
- [ ] `TRUST_PROXY` lists the web server and load-balancer addresses (never `true`).
- [ ] `CORS_ORIGINS` is exactly the production web origin(s).
- [ ] `OTP_PROVIDER=msg91` with DLT-approved templates.
- [ ] Redis-backed throttler storage if more than one API instance runs.
- [ ] Postgres not publicly reachable; automated encrypted backups; separate staging DB.
- [ ] Swagger left off (`SWAGGER_ENABLED` unset) or protected.
- [ ] Error monitoring/log shipping with redaction (no tokens, OTPs or medical notes).
- [ ] Change or remove all seed accounts (`admin@fitflow.local` etc.).

## Known gaps / follow-ups

| Item                                                                                    | Why it matters                                                                        | Plan                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Rate-limit store is in memory                                                           | Limits multiply with API instances and reset on restart                               | Redis store in Phase 1                                           |
| Access JWT valid up to 15 min after role change, deactivation or gym suspension         | Short window of stale permissions                                                     | Acceptable for now; add a per-user token version check if needed |
| Lock message reveals that an account exists                                             | Needs 5 failed attempts on that account first                                         | Accepted trade-off for usability                                 |
| OTP hourly cap is check-then-insert                                                     | Parallel requests could send a few extra SMS                                          | Move to a Redis counter with MSG91 in Phase 1                    |
| Refresh reuse detection vs. flaky mobile networks                                       | A retried refresh can log the user out of all sessions                                | Add a short grace window when the mobile app ships               |
| Medical notes visible to every role with `members.read` (incl. trainers, receptionists) | Sensitive health data under DPDP                                                      | Decide per product: separate `members.medical` permission        |
| No MFA for owners and super-admins                                                      | Password-only access to whole-gym or whole-platform data                              | TOTP MFA before the super-admin console (Phase 4)                |
| Composite tenant FKs                                                                    | FK checks bypass RLS; code must verify referenced IDs belong to the gym               | Keep the `assert…` checks; consider `(gymId, id)` FKs            |
| No password reset or change endpoints yet                                               | Staff passwords are set at provisioning                                               | Build with rate limits + single-use tokens                       |
| Next.js `X-Forwarded-For`                                                               | Next only sets it when missing, so a directly exposed Next server can be fed fake IPs | Always deploy behind a proxy (see checklist)                     |
