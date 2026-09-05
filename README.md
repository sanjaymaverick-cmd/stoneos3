@.claude/skills/token-optimization.md

# StoneOS — Vedam Granites Pilot

Modular monolith. NestJS backend + Next.js frontend, PostgreSQL via Prisma,
owner-issued local credentials for auth. **Runs locally only** — there is no
hosted environment.

> No production deployment exists. The AWS infrastructure this project
> previously ran on has been torn down and its config removed from the repo.
> Container images still build (see the Dockerfiles), but nothing is hosted.

## Structure

```
packages/backend         NestJS API — Prisma schema lives in prisma/schema.prisma
                          Dockerfile — production multi-stage build
packages/frontend        Next.js app (standalone output for Docker)
                          Dockerfile — production multi-stage build
docker-compose.yml        Local Postgres for DEVELOPMENT (npm run dev:*)
docker-compose.prod.yml   Build + run the production container images locally
                          (image smoke test — not a hosted environment)
stoneos-mvp-schema.sql   Reference DDL (source of truth for the data model —
                         keep schema.prisma in sync with this manually for now)
```

## Local setup

```bash
npm install
docker compose up -d          # local Postgres
cp .env.example packages/backend/.env
cp .env.example packages/frontend/.env.local   # then trim to the frontend vars
npm run db:migrate            # applies prisma/schema.prisma
npm run dev:backend           # http://localhost:4000
npm run dev:frontend          # http://localhost:3000
```

Auth is self-hosted — there is no third-party identity provider. Set
`SESSION_SECRET` (at least 32 characters, see `.env.example`) and that is all.

**There is no sign-up.** An account exists only because an owner created it:
`prisma/bootstrap.ts` mints the first owner, and everyone after that is issued
a username and a generated password through `POST /admin/users` (the
`/admin/users` page). Sign-in lives at `/sign-in`; a client-side `AuthGate`
redirects unauthenticated users there.

Passwords are scrypt hashes (`src/common/password.ts` — standard library, no
native dependency to break in the Alpine image); sessions are HS256 JWTs
(`src/common/session-token.ts`). Revoking a user sets `active=false` AND bumps
`tokenVersion`, and `SessionAuthGuard` re-checks both on every request — so
access ends on their next tap rather than whenever the token would expire.

## Deployment

**None.** There is no hosted environment — the app runs locally only.

Both packages still carry multi-stage production `Dockerfile`s, so the
release images can be built and smoke-tested locally:

```bash
docker compose -f docker-compose.prod.yml up --build
```

That is an image sanity check, not a deployment. Standing up a real
environment (host, database, secrets, TLS, CI/CD) is unscoped work.

## What's built vs. stubbed

| Module | Status |
|---|---|
| Inventory (raw blocks, slabs) | Built — append-only state transitions enforced at the service layer |
| Production — block-centric (CORRECTED) | Built — CuttingSession (block on B-21, can span days) + CuttingDayLog (per operational day, 7am–7am boundary) + PolishingSession (LPM glossy/leather runs against specific slabs). Block/slab state transitions happen atomically with session events. DPR daily aggregates are now DERIVED from sessions, not entered directly |
| Machines (B-21/LPM) | Built — `GET/POST /machines`, real dropdown in the production page (was a pasted UUID before). B-21 carries bladeCount (21), LPM carries headCount (16) + abrasivesPerHead (6) — used for consumables forecasting, not just labeling. Seed script: `prisma/seed-machines.ts` |
| Slab registration (SIMPLIFIED) | Built — supervisor enters TWO numbers at session completion: totalSlabsCut + finalGoodSlabCount (after inspection), not one tap per physical slab. App bulk-generates serials `{blockSerial}/{totalSlabsCut}/{sequence}` for the good ones only (e.g. V101/50/01..V101/50/47 for 47 good out of 50 cut). Damaged slabs (the difference) never become Slab/inventory rows — tracked only as damagedSlabCount on the session. Dimensions entered ONCE per session (99% of slabs from one block are identical size), applied to all generated slabs. expectedSlabCount at allocation is now optional (planning estimate only) |
| Sales (orders, line items, daily summary) | Built — order+lineitems created atomically; linked slabs auto-transition to 'sold'; daily summary recomputes from real line items on every order, with a separate backfill-only endpoint for historical cash-book totals |
| Expenses (incl. vehicles, cost allocation) | Built — category validated against the real Vedam Granites list; vehicleId required when category='vehicle'; allocation endpoint rejects over-allocation past the expense total |
| Tally import | Built — daybook/trial-balance ledger import plus item-level stock detail (`TallyVoucherItem`) with a `GET /tally-import/item-cross-check` sqft cross-check against `sales_line_item`. Real-data verification against an actual Tally export is OUT OF SCOPE for now (Owner's call) — no sample export exists in this repo, and running that verification isn't being pursued at the moment |
| Auth + user provisioning | Built — TWO paths: (1) `prisma/bootstrap.ts` for the very-first-ever setup — creates the Factory, seeds B-21/LPM, and grants the first owner (solves the chicken-and-egg problem: no admin exists yet to use the guarded endpoint). (2) `POST /admin/users` (owner/admin only, via `RolesGuard`) for ongoing provisioning after that — creates the login, generates a one-time password for the owner to hand over, and grants a role, always scoped to the caller's own factory. Revoke/reinstate/reset-password live alongside it |
| Frontend DPR page | Built — `/dpr` ("Production — B-21"): block allocation, per-day cutting logs, and session completion with per-slab dimension overrides, using real API data throughout |
| Frontend Admin/Team page | Built — `/admin/users`: grant access by email + role, team list. Hidden from non-admins client-side; enforced server-side regardless |
| Frontend Sales page | Built — `/sales`: new order form with dynamic line items, customer picker with quick-add, recent orders list |
| Frontend Expenses page | Built — `/expenses`: add-expense form with category-driven vehicle field, quick-add vehicle, recent expenses list |
| Shared design system | `app/globals.css` — extracted from the DPR artifact so every page matches without re-declaring styles; `components/AppNav.tsx` links Dashboard/Production/Sales/Expenses |
| Dashboard | Built for owner/admin — `/dashboard` shows 5 real widgets (30-day sales/expense summary, active cutting sessions, raw block stock snapshot, recent activity), role-gated via `useRole()`, verified live in a browser. Every other role sees a placeholder; role-based views for accountant/manager/supervisor/operator/auditor are OUT OF SCOPE for this version (Owner's call, no plan to build them) |

## Setting up a database

Any database, local or hosted, in this order:

```bash
npx prisma migrate deploy --schema packages/backend/prisma/schema.prisma
COPILOT_DB_PASSWORD='<generated secret>' npm run db:provision-roles
OWNER_USERNAME=you npx ts-node packages/backend/prisma/bootstrap.ts
```

Migrations create the Copilot's read-only role **without a password and
without login**, so it cannot connect until `db:provision-roles` gives it
one. Generate that secret, keep it in a secret store, and use the same value
in `COPILOT_DATABASE_URL`:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### What this needs from the database

Only an ordinary application role. **No superuser.** The role must own its
tables (it does, by running the migrations) and needs `CREATEROLE` so the
Copilot role can be created. `migrate dev` additionally needs `CREATEDB` for
Prisma's shadow database; `migrate deploy` does not.

Row-level security is `ENABLE`d but deliberately not `FORCE`d. Postgres
exempts a table's owner from RLS unless FORCE is set, so the application
reads normally while `stoneos_copilot_ro` — which owns nothing — stays fully
enforced and returns zero rows if the factory scope is ever unset. An earlier
version forced RLS and compensated by granting the app `BYPASSRLS`, which
needs superuser and is not available on RDS, Neon or Supabase.

## Multi-tenant enforcement

Every table carries `factory_id`. The enforcement point is
`SessionAuthGuard` + `@CurrentUser()`: every controller pulls `factoryId`
from the authenticated user's own row and every service method
filters on it. There is no global "list everything" query anywhere in
the codebase — if you add one, you've broken tenant isolation.

## Next steps (suggested order)

**Close out remaining gaps in what's already built:**
1. ~~Run `prisma/bootstrap.ts`~~ — DONE (local Postgres). Reused the existing `Factory` row
   rather than creating a duplicate (fixed `bootstrap.ts` to `findFirst`-then-create, so it's
   now safe to re-run against a factory that already has backfilled data linked to it), seeded
   B-21/LPM, granted `sanjay.maverick@gmail.com` owner access. Use `prisma/seed-machines.ts`
   later only if you add a second factory.
2. ~~User provisioning flow~~ — DONE, backend AND frontend. `/admin/users` page: grant-access form + team list, gated client-side via the session's `role` (owner/admin only — real enforcement is still server-side via RolesGuard, the client check is just UX). "Team" link in nav only appears for owner/admin.
3. ~~Cost allocation for damaged slabs~~ — DONE. `GET /raw-blocks/:id` returns a computed `damagedSlabLoss` object valuing damaged slabs at raw block purchase price (never finished slab price — see schema notes). Scoped to the detail endpoint only, not the list endpoint.
4. ~~Recovery ratio report~~ — DONE. `GET /raw-blocks/recovery-ratio` computes sale-time sqft sold per ton of rough block against the 105 sqft/ton benchmark; live page at `/recovery-ratio`.
5. ~~Per-slab dimension overrides~~ — DONE. `CuttingSession.complete()` accepts an opt-in `slabOverrides` array for the rare mixed-size batch; the default uniform-size path is unchanged.
6. ~~Item-level Tally detail~~ — DONE (code-complete). `TallyVoucherItem` + `GET /tally-import/item-cross-check` cross-checks sqft against `sales_line_item`. Real-data verification against an actual Tally export is OUT OF SCOPE for now (Owner's call) — no sample export exists in this repo, and it isn't being pursued at the moment.

**Deployment — REMOVED, no longer in scope:**
7. ~~Dockerfile~~ — DONE, both backend and frontend, multi-stage production builds. Kept: the
   images still build and can be smoke-tested locally via `docker-compose.prod.yml`.
8. **Hosting — none.** The project previously ran on AWS; that environment has been torn down
   and all of its config (`deploy/`, `AWS-DEPLOYMENT.md`, the deploy workflow) removed from the
   repo. Standing up a new environment is unscoped — no host, database, secrets store, TLS, or
   CD pipeline exists.
9. ~~Backfill the historical data~~ — script built and confirmed against local Postgres
   (`packages/backend/prisma/backfill-historical.ts`). Running it against any real database is
   OUT OF SCOPE for the team — Owner does that manually himself.

**The bigger one, once the above is live:**
10. The AI Business Analyst / Copilot itself — the actual reason StoneOS exists, per the original spec. Everything so far has been the foundation (clean structured data, traceability, the semantic layer it needs to reason over). This hasn't been started yet, and it's the natural next phase once real data is flowing daily rather than sitting in our working files.

## API reference — Sales & Expenses

```
GET  /sales-orders                    list orders (with line items, customer)
GET  /sales-orders/:id                one order
POST /sales-orders                    { customerId, orderDate, lineItems: [...] }
                                       — atomic; linked slabs auto-transition to 'sold';
                                         daily summary recomputed automatically

GET  /daily-sales-summary?from&to     range of daily totals
POST /daily-sales-summary/backfill    { summaryDate, totalQtySqft, invoicedAmount,
                                         actualAmountReceived } — HISTORICAL BACKFILL ONLY,
                                       never call from day-to-day UI

GET  /expenses/categories             the fixed real-world category list
GET  /expenses?from&to                list expenses in a date range
POST /expenses                        { category, amount, expenseDate, vehicleId?, toWhom? }
                                       — vehicleId required when category='vehicle'
POST /expenses/:id/allocate           { allocations: [{ rawBlockId, allocatedAmount,
                                         allocationMethod }] } — rejects over-allocation

GET  /vehicles                        list vehicles
POST /vehicles                        { name, vehicleType?, purchaseDate? }
```

## Three Man Team
Available agents: Arch (Architect), Bob (Builder), Richard (Reviewer)
