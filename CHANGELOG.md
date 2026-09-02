# Changelog

High-level record of significant changes. Commit history has the detail.

## 2026-09-02 — Deployment removed

The project is no longer hosted anywhere. Torn down and deleted from the repo:
the as-built cloud infrastructure config (`deploy/` — task definitions and IAM
policies), the `AWS-DEPLOYMENT.md` plan, and the disabled CD workflow
(`.github/workflows/deploy.yml.disabled`).

Kept: both multi-stage production `Dockerfile`s and `docker-compose.prod.yml`,
so the release images still build and can be smoke-tested locally. That is an
image check, not a deployment.

Standing up a new environment is unscoped — no host, managed database, secrets
store, TLS, or CD pipeline exists.

## 2026-07-09 — Clerk Core 3 upgrade + production image build

Took the project from "builds locally" to "produces working release images".

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
  `verifyToken` → database query → `200`).

### Production Docker fixes (found via local smoke test)
- Backend `tsconfig.json` had no `include`, so `prisma/*.ts` was swept into the
  build and shifted the entrypoint to `dist/src/main.js`. Added `include`.
- Prisma engine targeted OpenSSL 1.1 but `node:20-alpine` ships OpenSSL 3.x —
  pinned `binaryTargets` and installed `openssl` in the image.

> A cloud environment was also stood up at this point. It has since been torn
> down and removed from the repo — see the 2026-09-02 entry.

### Known follow-ups
Clerk dev keys → live keys; a real `/health` endpoint; historical data backfill.
