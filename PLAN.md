# FitFlow: product and build plan

The source of truth for **what** we are building and **in what order**. For **how** the code
is organised and the rules to follow, see [CLAUDE.md](CLAUDE.md).

## Product decisions (fixed)

| Decision       | Choice                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| Business model | Multi-gym SaaS: many gyms subscribe to FitFlow, and data is isolated per gym              |
| Market         | India first: INR, GST invoices, Razorpay/UPI, WhatsApp + SMS (MSG91, DLT templates)       |
| Stack          | Next.js (web) + NestJS (API) + PostgreSQL/Prisma, Expo React Native (mobile)              |
| Apps           | Gym admin/owner web panel, member mobile app, trainer mobile app, super-admin console     |
| Branding       | FitFlow is its own product. Feature parity with gym software like YDL; no copied branding |

## Feature modules (full scope)

| #   | Module                    | Key features                                                                                                                                   |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Gym onboarding & settings | Profile, logo, branches, GSTIN, hours, invoice prefix, tax settings, holidays                                                                  |
| 2   | Members                   | Profile, photo, ID proof, emergency contact, medical notes, member code, tags, family links, documents, search/filters, Excel import           |
| 3   | Membership plans          | Duration/session/class plans, joining fee, add-ons, discounts/coupons, freeze, extend, upgrade, transfer, cancel + refund, auto-renew          |
| 4   | Billing & payments        | GST invoices (CGST/SGST/IGST), PDF receipts, part payments and dues, cash/UPI/card/online, Razorpay links + UPI AutoPay, refunds, credit notes |
| 5   | Attendance                | QR check-in, manual check-in, biometric/RFID (ZKTeco/eSSL), block on expiry/dues, live "in gym" count                                          |
| 6   | Enquiries / CRM           | Lead capture (walk-in, web form, Meta lead ads), follow-ups, pipeline, trial passes, conversion and source reports                             |
| 7   | Notifications             | WhatsApp, SMS, push, email: renewals, dues, birthdays, absentees, receipts, campaigns; templates; scheduling                                   |
| 8   | Trainers & PT             | Trainer profiles, client assignment, PT packages, session logs, commission                                                                     |
| 9   | Workout & diet            | Exercise library, workout and diet plan builders, templates, member logging                                                                    |
| 10  | Progress tracking         | Measurements, weight, BMI, body fat, photos, charts                                                                                            |
| 11  | Classes & scheduling      | Group classes, timetable, capacity, booking, waitlist, class attendance                                                                        |
| 12  | Staff & HR                | Custom roles/permissions, staff attendance, shifts, payroll, incentives                                                                        |
| 13  | POS & inventory           | Supplements and merchandise sales, stock in/out, low-stock alerts, vendors                                                                     |
| 14  | Expenses                  | Categories, recurring expenses, P&L                                                                                                            |
| 15  | Reports & dashboard       | Revenue, collections, dues, renewals due, expiring, attendance trends, lead conversion, trainer performance, Excel/PDF export                  |
| 16  | Member app                | OTP login, membership status, pay/renew, QR check-in, class booking, workouts/diet, progress, referrals, notifications                         |
| 17  | Trainer app               | Assigned clients, today's sessions, log workouts and measurements, assign plans, chat                                                          |
| 18  | Super-admin console       | Manage gyms, SaaS tiers + feature flags, SaaS billing, usage metrics, audited impersonation, message-credit wallet                             |
| 19  | Later                     | Referral rewards, gym website builder, white-label app, AI workout/diet suggestions, Hindi/regional languages, Tally export                    |

## Architecture (summary)

- Monorepo: `apps/{api,web,mobile}`, `packages/{db,shared,ui,config}`, `infra/`.
- One Expo app with role-based navigation for members **and** trainers. Split it later only if needed.
- Shared DB with `gymId` on every tenant table. Isolation is enforced by a Prisma extension
  **and** PostgreSQL row-level security. `branchId` sits under the gym for chains.
- Redis + BullMQ (from Phase 1) for reminders, expiry jobs and device sync. S3-compatible
  storage (MinIO locally, R2/S3 in production) for photos, documents and invoice PDFs.
- Per-gym subdomain (`<gym>.fitflow.in`) later, with optional custom domain.

## Phases and status

| Phase               | Scope                                                                                                                                                                            | Status  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 0 Foundation        | Monorepo, docker-compose, CI, Prisma schema + RLS, auth (password + OTP), RBAC, audit log, members CRUD, admin web shell, Swagger                                                | ✅ Done |
| 1 Front desk MVP    | See breakdown below                                                                                                                                                              | ⏭ Next  |
| 2 Mobile & training | Expo app (member + trainer flows), exercise library, workout/diet builders, progress, classes + booking/waitlist, PT packages and sessions                                       | Planned |
| 3 Operations depth  | Biometric devices + access rules, staff HR/payroll, POS + inventory, expenses + P&L, multi-branch reports, campaigns, referrals, coupons                                         | Planned |
| 4 SaaS layer        | Super-admin console, SaaS tiers + feature flags, Razorpay Subscriptions for gyms, message-credit wallet, impersonation, usage analytics, self-serve signup + trial, landing site | Planned |

Rough sizing with 2–3 developers: Phase 1 ≈ 6 weeks, Phase 2 ≈ 6, Phase 3 ≈ 5, Phase 4 ≈ 4.

### Phase 0: what exists

- Models: `Gym`, `Branch`, `Role` (permissions stored as a string array), `User`, `Member`,
  `Plan`, `Membership`, `AuditLog`, `RefreshToken`, `OtpCode`.
- API: `/v1/auth/*` (login, otp/request, otp/verify, refresh, logout, me), `/v1/members` CRUD
  (soft delete), `/health`, Swagger at `/docs` (off in production by default).
- Web: login, dashboard placeholder, members list/search/create/edit/remove. Other nav items show "soon".
- Security hardening: rate limits, account lockout, OTP limits, BFF proxy limits, security
  headers. See docs/SECURITY.md.
- Tests: unit tests (shared, db, api guards) plus e2e suites for auth, tenancy/RLS,
  members RBAC and security.

Deviations from the first draft: there is no `Permission` table (the permission catalog lives
in code, and each role stores its permission keys). Mobile app scaffolding is deferred to Phase 2.

### Phase 1 breakdown (suggested order)

Each item follows the module checklist in CLAUDE.md: schema, RLS migration, TENANT_MODELS,
shared schemas, API module with audit, e2e (RBAC + isolation), web pages.

1. **Gym settings & branches.** Settings page (profile, GSTIN, state code, invoice prefix,
   hours), branch CRUD. Permission `settings.manage`.
2. **Plans.** CRUD for `Plan` (duration days, price, joining fee, SAC code, GST rate,
   active flag). Permissions `plans.*`.
3. **Memberships.** Assign a plan to a member, renew (start the day after current end),
   freeze/unfreeze (extends end date), cancel. Status is derived; a nightly job marks
   expired memberships. Validate that planId/memberId belong to the gym (FK checks bypass RLS).
4. **Billing.** `Invoice`, `InvoiceItem`, `Payment`, `Refund`. GST split: CGST+SGST when the
   gym's state equals the place of supply, otherwise IGST. Gap-free invoice numbers per gym
   per financial year (row-locked counter). Part payments, dues, PDF receipts (S3).
   Razorpay payment links + webhook (verify signature, idempotent). Refunds need `billing.refund`.
5. **Attendance.** Manual check-in at the front desk, QR check-in (signed, short-lived token),
   block when the membership is expired or dues are pending (configurable), live "in gym" count.
6. **Enquiries / leads.** `Lead`, `LeadFollowUp`, status pipeline, follow-up reminders, convert a lead to a member.
7. **Notifications.** Redis + BullMQ. WhatsApp (Meta Cloud API or BSP) and MSG91 SMS
   (DLT templates) for renewal, dues and birthday reminders. `NotificationLog`. Swap the `log`
   OTP sender for MSG91. Per-gym message limits, so one gym cannot run up SMS costs.
8. **Dashboard & reports.** Collections, dues, expiring soon, renewals, attendance; Excel export.
9. **Excel import of members** (validate every row with `memberCreateSchema`, report errors per row).

Before production (Phase 1 exit): Redis-backed rate limiting, MSG91 OTP, error monitoring,
backups, and the production checklist in docs/SECURITY.md.

## Verification (definition of done per module)

- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` pass locally and in CI.
- e2e proves: the happy path works, a role without the permission gets 403, and another gym gets 404.
- Phase 1 specifics: a Razorpay test-mode webhook marks an invoice paid; GST split is
  verified for intra- and inter-state invoices; a reminder job sends to a WhatsApp/SMS sandbox.
