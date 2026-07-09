# Changelog

High-level record of significant changes. Commit history has the detail.

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
