@.claude/skills/token-optimization.md

# StoneOS — Vedam Granites Pilot

Modular monolith. NestJS backend + Next.js frontend, PostgreSQL via Prisma,
Clerk for auth. **Runs locally only** — there is no hosted environment.

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

You'll need a Clerk account (clerk.com) for `CLERK_SECRET_KEY` and
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — free tier is enough for development.
The app uses **Clerk Core 3** (`@clerk/nextjs` v7 on the frontend,
`@clerk/backend` v3 on the backend). Sign-in/sign-up live at `/sign-in`
and `/sign-up`; a client-side `AuthGate` redirects unauthenticated users.

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
| Inventory ledger | Built — every block/slab movement is appended to `inventory_movement` with a caller-supplied idempotency key, so a retried request returns the original row instead of double-posting. The rules are CHECK constraints in the migration, not only service-layer checks. `GET/POST /inventory/movements`, `GET /inventory/locations` |
| Opening inventory count | Built — `/setup/opening-inventory` walks a factory through its first physical count (blocks, then slabs, with slabs allowed to have no parent block since pre-system slabs have no cutting session to point at). Posts through the ledger like everything else |
| Production — block-centric (CORRECTED) | Built — CuttingSession (block on B-21, can span days) + CuttingDayLog (per operational day, 7am–7am boundary) + PolishingSession (LPM glossy/leather runs against specific slabs). Block/slab state transitions happen atomically with session events. DPR daily aggregates are now DERIVED from sessions, not entered directly |
| Machines (B-21/LPM) | Built — `GET/POST /machines`, real dropdown in the production page (was a pasted UUID before). B-21 carries bladeCount (21), LPM carries headCount (16) + abrasivesPerHead (6) — used for consumables forecasting, not just labeling. Seed script: `prisma/seed-machines.ts` |
| Slab registration (SIMPLIFIED) | Built — supervisor enters TWO numbers at session completion: totalSlabsCut + finalGoodSlabCount (after inspection), not one tap per physical slab. App bulk-generates serials `{blockSerial}/{totalSlabsCut}/{sequence}` for the good ones only (e.g. V101/50/01..V101/50/47 for 47 good out of 50 cut). Damaged slabs (the difference) never become Slab/inventory rows — tracked only as damagedSlabCount on the session. Dimensions entered ONCE per session (99% of slabs from one block are identical size), applied to all generated slabs. expectedSlabCount at allocation is now optional (planning estimate only) |
| Sales (orders, line items, daily summary) | Built — order+lineitems created atomically; linked slabs auto-transition to 'sold'; daily summary recomputes from real line items on every order, with a separate backfill-only endpoint for historical cash-book totals |
| Expenses (incl. vehicles, cost allocation) | Built — category validated against the real Vedam Granites list; vehicleId required when category='vehicle'; allocation endpoint rejects over-allocation past the expense total |
| Tally import | Built — daybook/trial-balance ledger import plus item-level stock detail (`TallyVoucherItem`) with a `GET /tally-import/item-cross-check` sqft cross-check against `sales_line_item`. Real-data verification against an actual Tally export is OUT OF SCOPE for now (Owner's call) — no sample export exists in this repo, and running that verification isn't being pursued at the moment |
| Auth + user provisioning | Built — TWO paths: (1) `prisma/bootstrap.ts` for the very-first-ever setup — creates the Factory, seeds B-21/LPM, and grants the first owner (solves the chicken-and-egg problem: no admin exists yet to use the guarded endpoint). (2) `POST /admin/users` (owner/admin only, via new `RolesGuard`) for ongoing provisioning after that — looks up a teammate's Clerk account by email and grants them a role, always scoped to the caller's own factory |
| Frontend DPR page | Built — `/dpr` ("Production — B-21"): block allocation, per-day cutting logs, and session completion with per-slab dimension overrides, using real API data throughout |
| Frontend Admin/Team page | Built — `/admin/users`: grant access by email + role, team list. Hidden from non-admins client-side; enforced server-side regardless |
| Frontend Sales page | Built — `/sales`: new order form with dynamic line items, customer picker with quick-add, recent orders list |
| Frontend Expenses page | Built — `/expenses`: add-expense form with category-driven vehicle field, quick-add vehicle, recent expenses list |
| Shared design system | `app/globals.css` — extracted from the DPR artifact so every page matches without re-declaring styles; `components/AppNav.tsx` links Dashboard/Production/Sales/Expenses |
| Dashboard | Built for owner/admin — `/dashboard` shows 5 real widgets (30-day sales/expense summary, active cutting sessions, raw block stock snapshot, recent activity), role-gated via `useRole()`, verified live in a browser. Every other role sees a placeholder; role-based views for accountant/manager/supervisor/operator/auditor are OUT OF SCOPE for this version (Owner's call, no plan to build them) |
| AI Copilot | Built — owner-only `/copilot` chat page over `POST /copilot/ask`. Gemini writes the SQL, a validator rejects anything that is not a single read-only `SELECT`/CTE, and it executes through the `stoneos_copilot_ro` role under RLS. Every attempt is logged to `copilot_query_log`. **Never live-tested end to end** — the Gemini account has no free-tier quota provisioned (see the checkpoint) |
| Access control | Built — `RolesGuard` on every endpoint, a shared route policy the nav and `RouteAccessGuard` both read from (so the client never offers a link the server would refuse), and granting/removing ownership restricted to owners |
| Operability | Built — `/health` liveness and `/health/ready` readiness probes, CORS allow-list, HTTP security headers, and both images running as the unprivileged `node` user |
| Marketing/manual video | Built — `packages/video`, a Remotion workspace rendering the product manual and partner marketing videos (`npm run video:*`) |

## Setting up a database

Any database, local or hosted, in this order:

```bash
npx prisma migrate deploy --schema packages/backend/prisma/schema.prisma
COPILOT_DB_PASSWORD='<generated secret>' npm run db:provision-roles
OWNER_EMAIL=you@example.com npx ts-node packages/backend/prisma/bootstrap.ts
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
`ClerkAuthGuard` + `@CurrentUser()`: every controller pulls `factoryId`
from the authenticated user's Clerk metadata and every service method
filters on it. There is no global "list everything" query anywhere in
the codebase — if you add one, you've broken tenant isolation.

## Next steps (suggested order)

**Close out remaining gaps in what's already built:**
1. ~~Run `prisma/bootstrap.ts`~~ — DONE (local Postgres). Reused the existing `Factory` row
   rather than creating a duplicate (fixed `bootstrap.ts` to `findFirst`-then-create, so it's
   now safe to re-run against a factory that already has backfilled data linked to it), seeded
   B-21/LPM, granted `sanjay.maverick@gmail.com` owner access. Use `prisma/seed-machines.ts`
   later only if you add a second factory.
2. ~~User provisioning flow~~ — DONE, backend AND frontend. `/admin/users` page: grant-access form + team list, gated client-side via Clerk's `publicMetadata.role` (owner/admin only — real enforcement is still server-side via RolesGuard, the client check is just UX). "Team" link in nav only appears for owner/admin.
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

**The bigger one:**
10. ~~The AI Business Analyst / Copilot itself~~ — BUILT (Steps 6A + 6B), not yet proven against
    a live LLM. Step 6A is the safety foundation: Row-Level Security on 35 tenant-scoped tables plus
    a `stoneos_copilot_ro` role that owns nothing, so a query that forgets to filter by factory returns
    zero rows rather than another tenant's data. Step 6B is the feature: `POST /copilot/ask`, SQL
    validation, RLS-scoped execution, audit logging, and the owner-only `/copilot` page. The one thing
    still outstanding is a real end-to-end run through Gemini — blocked on that account having no
    free-tier `generateContent` quota provisioned, which is an account-side fix, not a code change.

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
