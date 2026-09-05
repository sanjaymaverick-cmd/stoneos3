# Deploying StoneOS to Northflank (free Sandbox tier)

## Live now

| What | Where |
|---|---|
| Frontend | https://p01--stoneos-web--fpd9p2zcyzpc.code.run |
| Backend | https://p01--stoneos-api--fpd9p2zcyzpc.code.run |
| Health | `curl https://p01--stoneos-api--fpd9p2zcyzpc.code.run/health` → `{"status":"ok","database":"reachable"}` |

Both services build from `sanjaymaverick-cmd/stoneos3`, branch `pwa-mobile`.
Backend runs `nf-compute-20` (0.2 vCPU / 512 MB), frontend `nf-compute-10`
(0.1 / 256 MB), Postgres 16 on `nf-compute-20` with 6 GB NVMe.

## Three things still to do

**1. Set the two secrets on `stoneos-api` → Environment.** Both currently read
`REPLACE_ME`. Generate the session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

- `SESSION_SECRET` — that value. Signing refuses anything under 32 characters,
  so sign-in cannot succeed until this is real.
- `GEMINI_API_KEY` — your Gemini key, for the Copilot.

Use **Update & restart**, not Update only, or the running pod keeps the old values.

**2. Run the migrations.** The database is empty, which is why `POST /auth/login`
currently returns 500 — `app_user` does not exist yet. See Step 2 below.

**3. Add a backup schedule** on the `stoneos-db` addon.

### How DATABASE_URL reaches the backend

A secret group, `stoneos-db-credentials`, links the `stoneos-db` addon and
exposes `NF_STONEOS_DB_POSTGRES_URI_ADMIN`. The backend then maps it with an
explicit runtime variable:

```
DATABASE_URL=${NF_STONEOS_DB_POSTGRES_URI_ADMIN}
```

The addon link also offers an *alias* feature that looks like it does the same
thing. It did not reach the container — the service crash-looped on Prisma
P1012 ("Environment variable not found: DATABASE_URL") until the explicit
mapping above was added. Prefer the explicit reference.

The **admin** URI is used deliberately, not the regular one. Migrations must
`CREATE ROLE` for the Copilot, and more importantly the app has to OWN its
tables: RLS is `ENABLE`d but not `FORCE`d, so Postgres exempts the owner. If
the app connected as a non-owner it would pass every check and then read zero
rows, silently.

---

Target shape, which is exactly what the Sandbox tier allows:

| Northflank object | What it runs |
|---|---|
| Service 1 | `packages/backend` — NestJS, port 4000 |
| Service 2 | `packages/frontend` — Next.js standalone, port 3000 |
| Addon 1 | PostgreSQL 16 |

Source: GitHub `sanjaymaverick-cmd/stoneos3`, branch **`pwa-mobile`**.

## Already done

- Project **`stoneos`**, region **Europe - West (London)**.
- Payment method added (anti-abuse verification; Sandbox is not billed).
- GitHub account linked.
- PostgreSQL addon **`stoneos-db`** — v16, `nf-compute-20` (0.2 vCPU / 512 MB),
  6 GB NVMe, database name `stoneos`, private.

## Region: London, and why

Free projects can only deploy to **US-Central** or **Europe-West (London)**.
Northflank *does* have an **`asia-south-delhi`** region, but it is marked
"Upgrade to pay as you go to use this region" — as is every Asia Pacific region.

So from India expect roughly **120–150 ms** to London, versus ~20–30 ms if you
later upgrade to pay-as-you-go and move to Delhi. Usable for testing;
noticeable on every API call.

---

## Before you build

Two things about this repo that are easy to miss:

1. **Build context is the package directory, not the repo root.** Both
   Dockerfiles `COPY package.json ./` expecting to already be inside
   `packages/backend` / `packages/frontend`.

2. **`NEXT_PUBLIC_API_URL` is baked in at build time.**
   `packages/frontend/Dockerfile` declares it as an `ARG`. It must be set as a
   **build argument**, not a runtime env var — a runtime value is silently
   ignored and the browser bundle keeps whatever was compiled in. Changing it
   needs a rebuild, not a restart.

### The circular dependency

The backend needs the frontend's URL (`FRONTEND_URL`, for CORS) and the
frontend needs the backend's URL (`NEXT_PUBLIC_API_URL`, at build time). Break
the cycle by **choosing both subdomains up front** rather than letting
Northflank assign them, so each value is known before either build runs.

```
frontend:  https://p01--stoneos-web--fpd9p2zcyzpc.code.run
backend:   https://p01--stoneos-api--fpd9p2zcyzpc.code.run
```

---

## Step 1 — Generate the two secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Run it twice. One value is `SESSION_SECRET` (signs session tokens), the other
is `COPILOT_DB_PASSWORD`. Keep both — they go into service env vars below, and
`COPILOT_DB_PASSWORD` must match between the database and the backend exactly.

Changing `SESSION_SECRET` later signs every user out.

## Step 2 — Bootstrap the database

The production backend image runs `npm install --omit=dev`, so it has **no
Prisma CLI and no ts-node**. Migrations cannot run inside the deployed
container.

The addon is **private**, so it has no public hostname. Rather than exposing
Postgres to the internet, port-forward it for the one-time bootstrap:

```bash
npm i -g @northflank/cli && northflank login
```

```bash
northflank forward addon --project stoneos --addon stoneos-db
```

That gives you a `localhost` port. With it open, in a second terminal:

```bash
export DATABASE_URL='postgresql://<user>:<pass>@localhost:<forwarded-port>/stoneos'
npx prisma migrate deploy --schema packages/backend/prisma/schema.prisma
```

This is a brand-new empty database, so the whole migration history applies
cleanly in order. The `migrate resolve` drift problem described in
`handoff/REVIEW-FEEDBACK.md` only affects databases where migrations were
partially applied — it does not apply here.

Provision the Copilot's read-only role:

```bash
COPILOT_DB_PASSWORD='<the second generated secret>' npm run db:provision-roles
```

> **If this fails on permissions**, the addon's user lacks `CREATEROLE`. Only
> `/copilot/ask` is affected; the rest of the app runs fine without it.

Then create the first owner — this is the only account that is not issued by
another user, and the password is printed once:

```bash
OWNER_USERNAME=sanjay npx ts-node packages/backend/prisma/bootstrap.ts
```

**Repeat `migrate deploy` this way after any future migration.** There is no
automatic migration step in the deployed image.

## Step 3 — Backend service

| Setting | Value |
|---|---|
| Build context | `/packages/backend` |
| Dockerfile | `Dockerfile` |
| Branch | `pwa-mobile` |
| Port | `4000` (HTTP, public) |
| Health — liveness | `GET /health/live` (process only, never touches the DB) |
| Health — readiness | `GET /health` (verifies Postgres is reachable) |

| Variable | Value |
|---|---|
| `DATABASE_URL` | addon **internal** connection string |
| `COPILOT_DATABASE_URL` | same host/db, user `stoneos_copilot_ro`, password from Step 1 |
| `SESSION_SECRET` | 🔒 the first secret from Step 1 |
| `GEMINI_API_KEY` | 🔒 your Gemini key |
| `FRONTEND_URL` | `https://p01--stoneos-web--fpd9p2zcyzpc.code.run` |
| `PORT` | `4000` |
| `SESSION_TTL_HOURS` | `12` (optional — how long a sign-in lasts) |

`FRONTEND_URL` accepts a comma-separated list
(`packages/backend/src/common/cors.ts`), so `http://localhost:3000` can stay
alongside it for local development.

## Step 4 — Frontend service

| Setting | Value |
|---|---|
| Build context | `/packages/frontend` |
| Dockerfile | `Dockerfile` |
| Branch | `pwa-mobile` |
| Port | `3000` (HTTP, public) |

**Build argument** (not runtime — see the warning above):

| Build arg | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://p01--stoneos-api--fpd9p2zcyzpc.code.run` |

The frontend needs no secrets of its own — authentication is entirely a
backend concern now.

## Step 5 — Verify

```bash
curl https://p01--stoneos-api--fpd9p2zcyzpc.code.run/health
```

Expect `{"status":"ok","database":"reachable"}`. A 503 means the service is up
but cannot reach Postgres — check `DATABASE_URL` is the *internal* string.

Then open the frontend, sign in with the owner credentials from Step 2, and
confirm the PWA installs on a phone. The service worker
(`packages/frontend/components/ServiceWorker.tsx`) requires HTTPS, which
Northflank provides on `code.run` domains.

---

## Auth model

Clerk has been removed. Authentication is entirely local, which is what makes
the owner-issues-credentials model possible.

| Capability | How |
|---|---|
| First owner | `prisma/bootstrap.ts` (Step 2) — the only account not issued by someone else |
| Owner issues a login | `POST /admin/users` / the `/admin/users` page. Creates the account and returns a generated password **once** |
| Promote or change role | Same endpoint with a different role. Deliberately does not touch their password |
| Revoke on exit | `POST /admin/users/:id/revoke` — sets `active=false` and bumps `tokenVersion` |
| Reinstate | `POST /admin/users/:id/reinstate` — restores access with a fresh password |
| Forgotten password | `POST /admin/users/:id/reset-password` |

**There is no sign-up route.** An employee cannot create an account, so there
is nothing to lock down in a dashboard somewhere.

Revocation is immediate rather than eventual: `SessionAuthGuard` re-reads the
user row on every request and rejects any token whose `tokenVersion` is stale,
so an ex-employee walking out with the app open loses access on their next tap.

Guardrails worth knowing: only an owner can grant, change or revoke ownership;
nobody can revoke themselves or drop their own owner role (which is what stops
a factory locking itself out of its own admin surface).

---

## Known gaps on this setup

- **Migrations are manual** (Step 2), from a developer machine over a
  port-forward.
- **Backups.** Add a schedule on the addon — its settings have a "Backup
  schedules" section — before anyone enters inventory data they care about.
- **The rate limiter is per-process**
  (`packages/backend/src/common/http-security.ts`). Correct on a single
  always-on instance, which is what Sandbox gives you. Scaling past one replica
  multiplies the effective limit. It is also the only brute-force protection on
  `POST /auth/login`, which is per-IP rather than per-account.
- **Tally import file size.** Uploads are held in memory as a buffer
  (`packages/backend/src/modules/tally/tally-import.controller.ts`). At 512 MB
  per service, a large Tally export may hit the ceiling.
