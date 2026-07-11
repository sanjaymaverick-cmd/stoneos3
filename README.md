@.claude/skills/token-optimization.md

# StoneOS — Vedam Granites Pilot

Modular monolith. NestJS backend + Next.js frontend, PostgreSQL via Prisma,
Clerk for auth. **Live on AWS** (RDS + ECS Fargate behind an ALB), deployed
continuously from `main` via GitHub Actions.

| | |
|---|---|
| **Frontend** | http://stoneos-alb-337796168.ap-south-1.elb.amazonaws.com |
| **Backend API** | http://stoneos-alb-337796168.ap-south-1.elb.amazonaws.com:8080 |
| **Infra docs** | [`deploy/README.md`](deploy/README.md) — as-built architecture, resources, CI/CD |

> HTTP only for now (AWS-generated hostname). HTTPS + a custom domain, and
> swapping Clerk dev keys for live keys, are the remaining hardening steps.

## Structure

```
packages/backend         NestJS API — Prisma schema lives in prisma/schema.prisma
                          Dockerfile — production multi-stage build
packages/frontend        Next.js app (standalone output for Docker)
                          Dockerfile — production multi-stage build
docker-compose.yml        Local Postgres for DEVELOPMENT (npm run dev:*)
docker-compose.prod.yml   Smoke-test the actual production images locally
                          before pushing to AWS
deploy/                   AS-BUILT AWS infra — task definitions, IAM policies,
                          architecture README (what is actually deployed)
AWS-DEPLOYMENT.md         SUPERSEDED App Runner plan — kept for reference only;
                          see deploy/README.md for the real ECS Fargate setup
.github/workflows/deploy.yml   CI/CD — builds + pushes images and redeploys both
                          ECS services on push to main (AWS auth via GitHub OIDC)
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

Live on **AWS ECS Fargate** behind an Application Load Balancer, with a
private **RDS PostgreSQL** database, in `ap-south-1`. Runtime secrets are
in SSM Parameter Store (never in images or git). Push to `main` triggers
GitHub Actions, which builds+pushes both images to ECR and force-deploys
both ECS services — AWS auth is via **GitHub OIDC**, so no long-lived AWS
keys are stored in GitHub.

```
                       Internet
                          │
              ┌───────────┴───────────┐
              │   ALB (stoneos-alb)   │
              │  :80   → frontend     │
              │  :8080 → backend API  │
              └───────┬───────┬───────┘
           frontend svc│       │backend svc      ECS Fargate
              (Next.js)│       │(NestJS)         (stoneos-cluster)
              :3000    │       │:4000
                               │ 5432
                         ┌─────▼──────┐
                         │  RDS PG 16 │  stoneos-db (private)
                         └────────────┘
```

Full resource inventory, security groups, IAM, and the migration/bootstrap
runbook are in [`deploy/README.md`](deploy/README.md). Local production-image
smoke test: `docker compose -f docker-compose.prod.yml up --build`.

## What's built vs. stubbed

| Module | Status |
|---|---|
| Inventory (raw blocks, slabs) | Built — append-only state transitions enforced at the service layer |
| Production — block-centric (CORRECTED) | Built — CuttingSession (block on B-21, can span days) + CuttingDayLog (per operational day, 7am–7am boundary) + PolishingSession (LPM glossy/leather runs against specific slabs). Block/slab state transitions happen atomically with session events. DPR daily aggregates are now DERIVED from sessions, not entered directly |
| Machines (B-21/LPM) | Built — `GET/POST /machines`, real dropdown in the production page (was a pasted UUID before). B-21 carries bladeCount (21), LPM carries headCount (16) + abrasivesPerHead (6) — used for consumables forecasting, not just labeling. Seed script: `prisma/seed-machines.ts` |
| Slab registration (SIMPLIFIED) | Built — supervisor enters TWO numbers at session completion: totalSlabsCut + finalGoodSlabCount (after inspection), not one tap per physical slab. App bulk-generates serials `{blockSerial}/{totalSlabsCut}/{sequence}` for the good ones only (e.g. V101/50/01..V101/50/47 for 47 good out of 50 cut). Damaged slabs (the difference) never become Slab/inventory rows — tracked only as damagedSlabCount on the session. Dimensions entered ONCE per session (99% of slabs from one block are identical size), applied to all generated slabs. expectedSlabCount at allocation is now optional (planning estimate only) |
| Sales (orders, line items, daily summary) | Built — order+lineitems created atomically; linked slabs auto-transition to 'sold'; daily summary recomputes from real line items on every order, with a separate backfill-only endpoint for historical cash-book totals |
| Expenses (incl. vehicles, cost allocation) | Built — category validated against the real Vedam Granites list; vehicleId required when category='vehicle'; allocation endpoint rejects over-allocation past the expense total |
| Tally import | Stubbed — see `modules/tally/tally.module.ts` |
| Auth + user provisioning | Built — TWO paths: (1) `prisma/bootstrap.ts` for the very-first-ever setup — creates the Factory, seeds B-21/LPM, and grants the first owner (solves the chicken-and-egg problem: no admin exists yet to use the guarded endpoint). (2) `POST /admin/users` (owner/admin only, via new `RolesGuard`) for ongoing provisioning after that — looks up a teammate's Clerk account by email and grants them a role, always scoped to the caller's own factory |
| Frontend DPR page | Minimal real-API version at `/dpr` — full field set and styling still needs porting from the `dpr-entry.jsx` artifact prototype |
| Frontend Admin/Team page | Built — `/admin/users`: grant access by email + role, team list. Hidden from non-admins client-side; enforced server-side regardless |
| Frontend Sales page | Built — `/sales`: new order form with dynamic line items, customer picker with quick-add, recent orders list |
| Frontend Expenses page | Built — `/expenses`: add-expense form with category-driven vehicle field, quick-add vehicle, recent expenses list |
| Shared design system | `app/globals.css` — extracted from the DPR artifact so every page matches without re-declaring styles; `components/AppNav.tsx` links Dashboard/Production/Sales/Expenses |
| Dashboard | Placeholder only |

## Multi-tenant enforcement

Every table carries `factory_id`. The enforcement point is
`ClerkAuthGuard` + `@CurrentUser()`: every controller pulls `factoryId`
from the authenticated user's Clerk metadata and every service method
filters on it. There is no global "list everything" query anywhere in
the codebase — if you add one, you've broken tenant isolation.

## Next steps (suggested order)

**Close out remaining gaps in what's already built:**
1. Run `prisma/bootstrap.ts` FIRST (`OWNER_EMAIL=you@example.com npx ts-node prisma/bootstrap.ts`) — creates the factory, seeds B-21/LPM, grants you owner access, all in one step. Use `prisma/seed-machines.ts` later only if you add a second factory. **Still outstanding** — local Postgres has a placeholder `Factory` row (inserted just to satisfy the backfill script's foreign key) but zero `Machine` rows and no real Clerk-authenticated owner grant, so a real bootstrap run hasn't happened yet.
2. ~~User provisioning flow~~ — DONE, backend AND frontend. `/admin/users` page: grant-access form + team list, gated client-side via Clerk's `publicMetadata.role` (owner/admin only — real enforcement is still server-side via RolesGuard, the client check is just UX). "Team" link in nav only appears for owner/admin.
3. Cost allocation for damaged slabs — `damagedSlabCount` is tracked but nothing yet values that loss against raw block cost (deliberately NOT finished slab price — see schema notes).
4. Recovery ratio report (105 sqft/ton benchmark) — documented on `RawBlock` in the schema, not yet built as a live report. Must use sale-time sqft only.
5. Per-slab dimension overrides for the rare mixed-size batch — completion currently assumes uniform size (true ~99% of the time).
6. Item-level Tally detail (sqft per sales line) — not imported yet, would enable a direct cross-check against `sales_line_item`.

**Get to a real deployment — DONE, now LIVE (see `deploy/README.md`):**
7. ~~Dockerfile~~ — DONE, both backend and frontend, multi-stage production builds.
8. ~~AWS deployment~~ — DONE and LIVE on ECS Fargate + ALB + RDS in `ap-south-1`. CI/CD redeploys on every push to `main` via GitHub Actions (OIDC auth, no stored AWS keys). App Runner was the original plan but wasn't available on the account, so we run on ECS instead. Full details in [`deploy/README.md`](deploy/README.md).
9. ~~Backfill the historical data~~ — script built and confirmed against local Postgres
   (`packages/backend/prisma/backfill-historical.ts`). Running it against any real/production
   database is OUT OF SCOPE for the team — Owner does that manually himself.

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
