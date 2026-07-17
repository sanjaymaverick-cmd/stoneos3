# Changelog

High-level record of significant changes. Commit history has the detail.

## 2026-07-17 — Partner demo environment (isolated, no sign-in)

Prep for a partner-facing demo of the latest (pre-ship) build, running as a
**separate** deployment that can't touch prod.

- **Demo mode.** `DEMO_MODE=true` (backend) makes `ClerkAuthGuard` skip Clerk
  and act as a fixed **read-only owner** on one seeded factory — only GETs and
  the Copilot ask endpoint pass; other mutations return `403`. Frontend
  `NEXT_PUBLIC_DEMO_MODE=true` drops the sign-in wall (`lib/demo.ts`,
  `AuthGate`, `useRole`, `api`, `AppNav`).
- **Copilot without Gemini.** In demo mode with no Gemini key, the Copilot
  serves canned answers over the seeded data
  (`copilot-demo-answers.ts`); a real key still runs the live text-to-SQL path.
- **Seed.** `prisma/seed-demo.ts` — idempotent Vedam Granites sample data
  (blocks, cutting/polishing, sales, expenses, 30-day summaries, recovery
  traces) scoped to the demo factory only.
- **Deploy.** Isolated `deploy/demo/` (task defs, expanded deploy policy),
  `.github/workflows/deploy-demo.yml.disabled`, `.env.demo.example`, and a
  runbook (`deploy/demo/README.md`). Frontend Dockerfile threads a
  `NEXT_PUBLIC_DEMO_MODE` build arg.

## 2026-07-09 — Clerk Core 3 upgrade + first AWS deployment

Took the project from "builds locally" to "live on AWS with CI/CD".

### Clerk Core 3 upgrade
- Ran the `@clerk/upgrade` codemods on both workspaces.
- Frontend: `@clerk/nextjs` v5 → **v7**; bumped Next.js to **15.5.20** (Clerk 7
  requires ≥15.2.3). Wrapped `getToken()` calls to handle the new
  `ClerkOfflineError` (`lib/api.ts` → `safeGetToken`).
- Backend: `@clerk/clerk-sdk-node` was **deprecated with no Core 3 release**, so
  migrated to **`@clerk/backend` v3** directly — new `common/clerk-client.ts`,
  and the guard now uses the standalone `verifyToken()`.
- Added the missing **sign-in/sign-up pages** (`/sign-in`, `/sign-up`) and a
  client-side `AuthGate`. (A `clerkMiddleware()` approach was tried first but
  misbehaved in this environment and is deprecated by Clerk anyway.)
- Verified end-to-end against a real Clerk session (token exchange → backend
  `verifyToken` → RDS query → `200`).

### Production Docker fixes (found via local smoke test)
- Backend `tsconfig.json` had no `include`, so `prisma/*.ts` was swept into the
  build and shifted the entrypoint to `dist/src/main.js`. Added `include`.
- Prisma engine targeted OpenSSL 1.1 but `node:20-alpine` ships OpenSSL 3.x —
  pinned `binaryTargets` and installed `openssl` in the image.

### AWS deployment (ECS Fargate)
- Provisioned RDS (Postgres 16, private), ECR, ECS Fargate cluster + 2 services,
  an ALB with two target groups/listeners, CloudWatch log groups, IAM roles, and
  security groups. Ran migrations + the owner/factory bootstrap against RDS.
- App Runner (the original plan) was unavailable on the account
  (`SubscriptionRequiredException`), so pivoted to ECS Fargate + ALB.
- Runtime secrets kept in **SSM Parameter Store** (SecureString), referenced by
  ARN from the task definitions — never in images or git.

### CI/CD
- Rewrote `.github/workflows/deploy.yml` for ECS: build+push both images to ECR,
  `force-new-deployment` on both services, wait for stable.
- AWS auth via **GitHub OIDC** (`stoneos-github-deploy` role) — no long-lived AWS
  keys in GitHub. Public `NEXT_PUBLIC_*` build args come from repo variables.
- As-built infra saved under `deploy/` (task defs, IAM policies, architecture
  README). First pipeline run succeeded; live app verified healthy after it.

### Known follow-ups
HTTPS + custom domain; Clerk dev keys → live keys; RDS backup retention (1 day,
free-tier cap); a real `/health` endpoint; historical data backfill.
