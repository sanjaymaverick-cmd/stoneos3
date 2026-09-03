# Changelog

High-level record of significant changes. Commit history has the detail.

## 2026-09-03 — Dependency security fixes

Trivy had been failing the `StoneOS Security` workflow on `main` since the hardening
import. Reproduced the exact scan locally and cleared all 11 fixable HIGH findings:

| Package | Was | Now | Why |
|---|---|---|---|
| `next` | 16.2.10 | 16.2.11 | authentication bypass, two SSRFs, a DoS (CVE-2026-64641/64642/64645/64649) |
| `multer` | 2.0.2 | 2.3.0 | four multipart DoS CVEs — reachable, the Tally XML import uploads through `FileInterceptor` |
| `postcss` | 8.4.31 (nested under `next`) | 8.5.26 (deduped) | path traversal in source-map auto-loading, info disclosure |
| `sharp` | 0.34.5 | 0.35.4 | four inherited libvips CVEs |

Only `next` is a direct dependency. The other three are pinned by packages we do not
control (`@nestjs/platform-express` 10.4.22 pins `multer` exactly; `next` pins `postcss`
exactly and ranges `sharp` below the fix), so they are lifted with npm `overrides`.

Those overrides are declared in **three** places on purpose: the root `package.json` drives
the lockfile that CI and Trivy read, and each `Dockerfile` copies only its own workspace
`package.json` and runs `npm install`, so an image would otherwise reinstall the vulnerable
version. Same reasoning as the existing React overrides.

Also: `allowScripts` is keyed by exact version, so `sharp@0.34.5` moved to `sharp@0.35.4`
with the bump — otherwise the install-script policy stops matching.

Two gotchas worth remembering, both found by CI rather than by reasoning:

- **An override cannot disagree with a direct dependency.** `postcss` is a direct
  devDependency of `packages/frontend`, so overriding it there to a different range fails
  the install outright with `EOVERRIDE`. Only the image build hits this — the root project
  declares no `postcss`, so a root-level `npm ci` passes and the problem stays invisible
  until `docker build` runs `npm install` inside the workspace. The fix is to raise the
  declared range and write the override as `"postcss": "$postcss"`, which points it at the
  direct dependency's own spec and still forces `next`'s nested pin up.
- **Verify a workspace override the way the image builds it**: that workspace's
  `package.json` alone in an empty directory, then `npm install`. A green root install
  proves nothing about the images.

## 2026-09-02 — Hardening import (PR #1)

Imported the hardening work from the ston3gpt build. The largest single change since the
Copilot:

- **Inventory ledger** — `inventory_movement`, append-only, idempotency-keyed, with the
  rules enforced as CHECK constraints in the migration rather than only in the service.
- **Opening inventory count** — guided first-count flow at `/setup/opening-inventory`,
  including slabs with no parent block (pre-system slabs have no cutting session).
- **Role-based access across all endpoints** — plus a shared route policy the nav and the
  client-side guard both read, and owner-only granting/removing of ownership.
- **Service-level test coverage** — 347 tests across 14 suites.
- **CI and security workflows** — `StoneOS CI` (Postgres service, migrations, tests, both
  builds, both production images) and `StoneOS Security` (CodeQL, Trivy, SBOM). Node 24
  everywhere.
- **Health probes and HTTP hardening**, containers running as non-root.
- **Production-viable bootstrap** — see the README's database setup section.
- **`packages/video`** — Remotion workspace for the product manual and marketing videos.
- **`design-system/stoneos/MASTER.md`** — the design system documented as implemented.

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
