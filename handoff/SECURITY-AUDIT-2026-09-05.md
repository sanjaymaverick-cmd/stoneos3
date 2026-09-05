# Security Audit — StoneOS3 — 2026-09-05

Branch `pwa-mobile` @ `50dd143`. Scope: the whole backend, the frontend session layer,
the RLS migrations, and production dependencies. Method: read the code. Nothing was run
against the live deployment and nothing in its database was touched. No file other than
this report was modified.

Threat model used for ranking: an in-house tool for 10-30 factory staff, used on shared
phones, reachable on the public internet, one factory today. "An operator can do it"
outranks "an owner can do it".

---

## Executive summary

1. The new auth code is **sound**. scrypt, the JWT, the guards and the revoke path are all
   correct — I found no way to forge a token, skip a role check, or keep access after revoke.
2. The real problem is elsewhere: **five endpoints copy the raw request body straight into a
   database write**, letting the caller set columns the code never meant to expose —
   including `factory_id` itself. An *operator* can do this. Fix these first.
3. `POST /cutting-sessions/:id/day-log` never checks the session belongs to the caller's
   factory at all. It is the one endpoint with no tenant boundary whatsoever.
4. Four "create" endpoints accept an id (customer, vehicle, machine, supplier) without
   checking it belongs to the caller — which can read another factory's customer or vehicle
   record back out.
5. With one factory live, items 2-4 cannot cross a tenant boundary **today**. They become
   real the day a second factory exists. Treat them as must-fix-before-second-factory.
6. RLS protects the Copilot only. It gives the main app **zero** tenant protection — that is
   by design and correctly documented, but it means the code fixes above are the only defence.
7. File upload has **no size limit**. One authenticated manager (or a stolen manager token)
   can OOM the single backend process with one big file.
8. Brute force on `/auth/login` is fine in practice (12-char random passwords, ~69 bits) but
   the rate limiter's `trust proxy 1` setting is unverified against Northflank's real hop
   count — worth 10 minutes to confirm.
9. Dependencies: of the 19 GitHub flags, **most are not reachable**. The genuinely reachable
   ones are `multer` (auth-gated upload DoS) and Next.js (patch to 16.2.11+, cheap).
10. localStorage tokens, public ports, in-memory rate limiting: accepted trade-offs, still
    defensible for this deployment. Details in the Low section.

---

## CRITICAL

None. No unauthenticated path reaches data, no token forgery, no auth bypass.

---

## HIGH

### H-1. Mass assignment: the request body overrides `factory_id` and other server-set columns

Five writes spread the raw request body into Prisma **after** the server-controlled fields,
so a body key silently wins over the server's value. There is no global `ValidationPipe`
(deliberately omitted, `src/main.ts:36-40`) and every one of these controllers types the body
as `any`, so nothing strips unexpected keys.

| File:line | Server field overridden | Minimum role |
|---|---|---|
| `packages/backend/src/modules/production/dpr.service.ts:44` | `factoryId`, `id`, `isDerived` | operator |
| `packages/backend/src/modules/inventory/slab.service.ts:31` | `factoryId`, `id`, `salesStatus` | supervisor |
| `packages/backend/src/modules/production/machine-log.service.ts:24` | `machineId` | operator |
| `packages/backend/src/modules/production/cutting-session.service.ts:116` | `cuttingSessionId` | operator |
| `packages/backend/src/modules/production/dpr.service.ts:43` / `cutting-session.service.ts:115` | (update paths — narrower, same shape) | operator |

Confirmed by reading the code, not speculation. Worked example, DPR:

```ts
// dpr.service.ts:34,44
const { reportDate, department, ...fields } = input;   // input === the raw body
create: { factoryId, reportDate: ..., department, ...fields, isDerived: false }
```

`POST /dpr` with body `{"reportDate":"2026-01-01","department":"cutting","factoryId":"<other-factory-uuid>"}`:
the `where` clause on the upsert uses the caller's *real* factoryId, finds nothing, and the
`create` branch runs with the attacker's `factoryId` — a row written into another factory.

`machine-log.service.ts` is the sharpest illustration. Lines 15-19 do the ownership check and
the comment above it says it is "the only tenant boundary here" — and then line 24 lets the
body put a different `machineId` back:

```ts
const machine = await this.prisma.machine.findFirst({ where: { id: machineId, factoryId } });
if (!machine) throw new NotFoundException("Machine not found");
...
create: { machineId, logDate: new Date(logDate), ...fields },   // body can re-set machineId
```

**Who:** any low-privileged operator with a valid session, or anyone holding a lifted phone
that is still signed in.
**Impact today (one factory):** cannot cross a tenant boundary — the only reachable
`factory_id` is the caller's own, and a bogus one fails the foreign key. What *is* live today
is the ability to set columns the API never meant to expose: an arbitrary primary key, a slab
created directly as `salesStatus: "sold"` (bypassing the sales flow and its state transition
records), `isDerived`/`isBackfilled` flags that make fabricated rows look system-generated.
**Impact the day a second factory exists:** direct cross-tenant write, from the lowest role
in the system.
**Fix:** put the server-controlled fields *after* the spread, or (better) pick fields
explicitly. A one-line reorder closes each one. This is also the case for finally adding the
DTO layer + `ValidationPipe` that `main.ts:36-40` defers.

### H-2. `POST /cutting-sessions/:id/day-log` has no tenant scoping at all

`packages/backend/src/modules/production/session.controllers.ts:33-37` →
`packages/backend/src/modules/production/cutting-session.service.ts:106-118`.

```ts
dayLog(@CurrentUser() user, @Param("id") id: string, @Body() body: any) {
  return this.service.upsertDayLog(id, user.id, body);   // factoryId never passed
}
```

`factoryId` is never passed to the service, and `cutting_day_log` carries no `factory_id`
column of its own, so nothing anywhere in this path checks the session belongs to the caller.
Every sibling endpoint (`start`, `complete`) does scope correctly — this one was missed.

**Who:** any operator. Session ids are UUIDs, not guessable, but they *are* returned in full
to every provisioned role by `GET /cutting-sessions`, so anyone who has ever worked in a
factory keeps a list of valid ids after being moved or revoked.
**Impact:** with one factory, an operator can only write into sessions they can already see —
low. With two factories, an ex-employee-turned-employee-of-factory-B can overwrite factory A's
production day logs (the upsert's `update` branch replaces the existing row's fields).
**Fix:** take `factoryId`, `findFirstOrThrow({ where: { id: sessionId, factoryId } })` before
the upsert, exactly as `complete()` at line 156 already does.

### H-3. File upload has no size limit — single-process OOM

`packages/backend/src/modules/tally/tally-import.controller.ts:25,33` uses bare
`FileInterceptor("file")` with no `limits`. Multer defaults to memory storage and *no* file
size cap, and the whole file is then held as a `Buffer` and passed to
`tally-import.service.ts:110` / `:198`, which decode the entire thing to a string
(`decodeTallyXml`, line 8) — so peak memory is roughly 3x the upload for a UTF-16 file.

Two further amplifiers I confirmed in the same file:
- `parseTrialBalance` (line 196-205) runs a regex with two `[\s\S]*?` spans across the whole
  document. On a large file with many `<DSPDISPNAME>` and no matching amount tags, the scan
  degrades toward quadratic.
- `importDaybook` line 232: `new Date(Math.min(...dates))`. `Math.min` with a spread of a very
  large array throws `RangeError: Maximum call stack size exceeded` — an uncaught crash, not a
  400 — at roughly 100k+ ledger entries.

**Who:** any user in the elevated tier (owner/admin/manager), or anyone with a lifted phone
belonging to one. Not an unauthenticated stranger — Nest runs guards *before* interceptors,
so multer never sees an unauthenticated request. That is a real mitigation and it is why this
is High and not Critical.
**Impact:** the backend is a single process with no health check configured, so an OOM kill or
an uncaught `RangeError` is a full outage until someone notices.
**Fix:** `FileInterceptor("file", { limits: { fileSize: 25 * 1024 * 1024, files: 1 } })`, and
replace the `Math.min(...dates)` spread with a reduce.

---

## MEDIUM

### M-1. Cross-tenant reference ids accepted without an ownership check

Four `create` paths take a foreign-key id from the body and write it without checking it
belongs to the caller's factory. The pattern is inconsistent with the rest of the codebase,
which does this correctly in at least six places (`inventory-movement.service.ts:175-198`,
`raw-block.service.ts:330-340`, `expense.service.ts:91-100`, `machine-log.service.ts:15`,
`polishing-session.service.ts:39-43`, `sales-order.service.ts:77`).

| File:line | Unchecked id | Read back out? |
|---|---|---|
| `sales/sales-order.service.ts:54` | `customerId` | **Yes** — `findAll`/`findOne` (lines 29,36) `include: { customer: true }` |
| `expenses/expense.service.ts:55` | `vehicleId` | **Yes** — `findAll` (line 36) `include: { vehicle: true }` |
| `production/cutting-session.service.ts:90` | `machineId` | no |
| `production/polishing-session.service.ts:52` | `machineId` | no |
| `inventory/raw-block.service.ts:216` | `supplierId` | no |

The first two are the ones that matter: they turn a *write* of an unchecked id into a *read*
of another tenant's row. `POST /sales-orders` with a customerId belonging to factory B, then
`GET /sales-orders`, returns factory B's customer name, `contactInfo` and `creditLimit`.
Same shape for vehicles.

**Who:** a sales-tier or supervisor user (sales orders), an accountant or supervisor
(expenses).
**Why Medium not High:** the ids are UUIDs and are never exposed to a user outside the owning
factory, so this needs an id obtained some other way — realistically an employee who moved
between factories. And with one factory today it is unreachable.
**Fix:** one `findFirst({ where: { id, factoryId } })` guard per site, matching the existing
pattern.

### M-2. Nothing verifies the Copilot's database connection is actually the read-only role

`copilot.service.ts:41-45` builds a `pg.Pool` from `COPILOT_DATABASE_URL` and never checks
what role it authenticates as. `CopilotReadinessService` (`copilot-readiness.service.ts:96-142`)
checks RLS coverage — but it does so over the *Prisma* connection (the app's admin role), not
over the Copilot pool. `startup-checks.ts:104` only warns if the variable is blank.

RLS is `ENABLE`d but deliberately not `FORCE`d (documented in
`prisma/migrations/20260713000000_copilot_rls_readonly_role/migration.sql:150-176` and in the
README). That means it does not apply to the table owner. So if `COPILOT_DATABASE_URL` is ever
set to the same admin credentials as `DATABASE_URL` — a plausible copy-paste when configuring
Northflank — the Copilot silently becomes an **unscoped, read-write** SQL executor driven by
an LLM, the readiness check still passes, and there is no log line saying anything changed.

**Who:** nobody attacks this; a misconfiguration causes it.
**Impact:** silent loss of both the tenant boundary and the read-only property for the one
feature whose entire safety story rests on them.
**Fix:** at startup, run `SELECT current_user, pg_has_role(current_user, 'stoneos_copilot_ro',
'member')` through the Copilot pool and refuse readiness if it is the app role, has BYPASSRLS,
or owns the tables. Ten lines, and it makes the deliberate no-FORCE decision safe to live with.

### M-3. SQL validator: quoted-identifier bypass of the `set_config` block

`packages/backend/src/modules/copilot/sql-validator.ts:50`

```ts
const FORBIDDEN_FUNCTION_CALLS: RegExp[] = [/(?:\bpg_catalog\s*\.\s*)?\bset_config\s*\(/i];
```

The comment above it correctly explains why this check exists: `stoneos_copilot_ro` may set
`app.current_factory_id` itself, so generated SQL calling `set_config` inside a CTE could
re-scope the transaction and read another factory's rows before `COMMIT` resets it. The regex
requires `set_config` followed by optional whitespace and `(`. Postgres also accepts the
quoted form:

```sql
SELECT "set_config"('app.current_factory_id', '<other-factory>', true)
```

Here the `(` follows a `"`, so the pattern does not match and the statement passes validation.
The `\bSET\b` keyword scan does not catch it either (`_` is a word character — noted in the
file's own comment).

**Who:** the owner, and only the owner — `POST /copilot/ask` is `@Roles("owner")`
(`copilot.controller.ts:18`), and reaching this requires steering Gemini into emitting that
exact SQL through the `question` field.
**Impact:** cross-factory *read* via the Copilot. Still read-only — the role holds no
INSERT/UPDATE/DELETE/DDL grants (`20260713000000` migration, line 96-98), which is the backstop
working as designed.
**Why Medium:** a confirmed, concrete bypass of a control the code relies on, but the attacker
is the owner and there is one factory. It gets worse if a second factory's owner is ever
provisioned.
**Fix:** match on a normalized identifier (strip `"` before scanning), or move to an allow-list
of permitted function names.

### M-4. `GRANT SELECT` on `app_user` includes `password_hash`, and Copilot output goes to Google

`20260713000000_copilot_rls_readonly_role/migration.sql:60-95` grants table-level `SELECT` on
`app_user` to `stoneos_copilot_ro`, which includes `password_hash` and `token_version`. RLS
scopes that to the caller's own factory, so the owner can ask the Copilot for their own staff's
password hashes, and `copilot.service.ts:206-224` (`formatAnswer`) sends up to 50 result rows
to Gemini as prompt text.

**Who:** the owner. Not privilege escalation — they can already reset any password.
**Impact:** staff password hashes (and any other query result) leave the deployment to a
third-party LLM API. Passwords are 12 characters from a 55-character alphabet (~69 bits,
`password.ts:76-83`), so offline cracking is not realistic; the concern is the data egress
path, not the hash strength.
**Fix:** column-level grant excluding `password_hash` — `GRANT SELECT (id, factory_id, name,
username, role, active, created_at) ON app_user TO stoneos_copilot_ro;`.

### M-5. `trust proxy 1` is unverified against Northflank's actual hop count

`src/main.ts:29` sets `trust proxy` to `1`, and `http-security.ts:59` buckets the rate limiter
on `req.ip`. Whether that is correct depends on exactly how many proxies sit in front of the
container:

- Exactly one hop (likely on Northflank) → correct, `req.ip` is the real client.
- Two or more hops (e.g. Cloudflare in front) → `req.ip` becomes the intermediate proxy, so
  **every client in the world shares one 120/min bucket** — a self-inflicted DoS the first
  time traffic picks up.
- Zero real hops → a client can send `X-Forwarded-For: 1.2.3.4` and choose its own bucket,
  removing the only brute-force control on `/auth/login`.

I could not determine which, without touching the deployment.
**Fix:** log `req.ip` and the raw `X-Forwarded-For` for one request against the live URL and
confirm they agree. Five minutes, and it settles the only thing standing between `/auth/login`
and unlimited guessing.

Also note the limiter is a **single global bucket per IP across all endpoints** — a phone
loading a busy dashboard competes with the login attempts. With 10-30 staff on one factory
Wi-Fi NAT, 120 req/min shared is tight enough that the first real symptom of this design is
likely to be staff getting 429s, not an attacker being stopped.

### M-6. Reachable dependency vulnerabilities

`npm audit --omit=dev` run in both packages. Verdict per finding, with reachability judged
against this codebase's actual call sites:

**Backend — genuinely reachable:**
- `multer` <2.2.0, 4 high + 1 moderate (GHSA-xf7r-hgr6-v32p, -v52c-386h-88mc, -5528-5vmv-3xc2,
  -72gw-mp4g-v24j, -3p4h-7m6x-2hcm). Reachable via the two `FileInterceptor` routes in
  `tally-import.controller.ts` — **but only after SessionAuthGuard and RolesGuard pass**
  (Nest runs guards before interceptors). So: authenticated elevated-tier DoS only, and it
  compounds H-3 above. Fix requires `@nestjs/platform-express` 12 (semver-major).
- `qs` (3 moderate). Reached by Express query parsing on every request, including
  unauthenticated ones. The three advisories are DoS/limit-bypass shapes with low practical
  impact here; this is the only one an unauthenticated stranger touches at all.

**Backend — NOT reachable (do not spend time on these):**
- `fast-xml-parser` GHSA-gh4j-gqv2-49f6 — the advisory is against **XMLBuilder**. This app only
  ever constructs `new XMLParser(...)` (`tally-import.service.ts:111`) and never builds XML.
  Not applicable.
- `file-type` (2 moderate, pulled in by `@nestjs/common`) — used by Nest's `FileTypeValidator`.
  This app uses no Nest file validators. Not applicable.
- `body-parser` GHSA-v422-hmwv-36x6 — triggers only when an invalid `limit` value is configured.
  This app configures none. Not applicable.
- `ajv`, `webpack` — build-time only, not in the running server.
- `@nestjs/core` GHSA-36xv-jgw5-4q75 — requires user interaction against a rendered response;
  this backend returns JSON only.
- **`xlsx` 0.18.5** is a **devDependency** (`package.json:40`) and appears nowhere in `src/`.
  Its only importer is `prisma/backfill-historical.ts:25`, a manual owner-run script. SheetJS
  0.18.5 has unpatched-on-npm prototype-pollution/ReDoS issues, so: only run that script on
  spreadsheets you produced yourself. It is not part of the server's attack surface, and the
  "xlsx parsing / zip bomb" concern in the audit brief does not apply to any HTTP endpoint —
  the Tally importer is XML-only.

**Frontend — mostly NOT reachable.** `next` 16.2.10, 3 high + 6 moderate. Checked each:
- Middleware/proxy bypass (GHSA-6gpp-xcg3-4w24) — needs `middleware.ts`. There is none.
- Three Server Actions advisories — no `"use server"` anywhere in `app/`, `lib/`, `components/`.
- Image Optimization SVG DoS (GHSA-q8wf-6r8g-63ch) — `next/image` is not used anywhere.
- Cache-confusion advisories — relevant only to a caching layer this deployment does not have.
- `postcss` / `sharp` — build-time and image-pipeline, neither exercised.

Still: upgrading `next` to 16.2.11 is a patch bump with essentially no risk, so do it — just
don't treat "3 high" as an emergency. The **backend** `@nestjs/platform-express` 12 upgrade is
the one that actually costs something (major) and buys something real (multer).

---

## LOW

### L-1. `/auth/login` accepts an unvalidated body and can be made to 500

`auth.controller.ts:19-21` passes `body?.username` straight to
`prisma.appUser.findUnique({ where: { username } })` (`auth.service.ts:19`) with no type
check. A body of `{"username": {"gt": ""}}` produces a `PrismaClientValidationError` → an
unhandled 500 on the one unauthenticated endpoint. Not an auth bypass — Prisma is not a
document store and there is no operator-injection semantics to exploit — but it is free
unauthenticated error-log noise and a 500 where a 400 belongs. `verifyPassword` handles the
same abuse correctly (`password.ts:64-71` catches and returns false).

### L-2. `PROVISIONABLE_ROLES` is defined and never used

`role-policy.ts:78-85` and its spec exist to keep `owner` out of the grantable set, but
`provision-user.service.ts:47` validates against `SCHEMA_ROLES` instead — which *does*
contain `owner`. This is **not** a vulnerability: the owner-grant path is separately gated at
lines 51-53 (`role === OWNER_ROLE && !actorIsOwner` → 403), which I traced and confirmed.
It is a live trap for the next person who edits either constant. Either use
`PROVISIONABLE_ROLES` (plus the explicit owner branch) or delete it.

### L-3. `payment` rows with a null `invoice_id` are invisible to the Copilot

Already documented in the migration itself (`20260713000000...migration.sql:288-293`) as
fail-closed. Confirmed still true. Correctness gap in Copilot answers, not a security issue.
Listed only so it is not re-discovered as new.

### L-4. Accepted trade-offs — re-checked, all still defensible

Each of these is recorded as deliberate in `handoff/` or in code comments. I am not reporting
them as findings; here is whether they still hold:

- **Session tokens in `localStorage`** (`lib/session.tsx:9-15`). Holds. The app ships no
  third-party scripts, uses Bearer headers (so no CSRF surface at all), and the CSP is
  `default-src 'none'` (`http-security.ts:41`). The XSS-steals-the-token risk is real in
  principle but there is currently no injection sink to reach it. The mitigation the comment
  claims — backend re-checks `active`/`tokenVersion` per request — is genuinely implemented
  (`session-auth.guard.ts:34-42`).
- **Per-process in-memory rate limiter** (`http-security.ts:14-18`). Holds *if* the service
  stays at one replica. Scaling to two silently doubles the allowance. The bucket-eviction
  sweep that was added over the ston3gpt original (line 30-37) is correct and does bound the
  map.
- **App connects as the addon's admin user.** Holds, and is the right call given no-FORCE RLS —
  but it means the blast radius of leaking `DATABASE_URL` is the entire database including DDL
  and role management, and it removes RLS as a safety net behind every finding in this report.
  The residual risk is concentrated in M-2 (nothing checks the Copilot isn't using it too).
- **No health checks configured, both services on public ports.** Compounds H-3: an OOM-killed
  or crashed backend is not detected or restarted. Adding the Northflank health check pointed
  at `GET /health/live` costs nothing — the endpoint already exists (`health.controller.ts:20-23`)
  and the rate limiter already exempts it (`http-security.ts:51`).
- **No global `ValidationPipe`** (`main.ts:36-40`). The stated reason (no DTO classes yet, so
  `whitelist` would strip everything) is accurate. But H-1 is precisely the bug that pipe
  prevents, so this trade-off has now cost something concrete.

---

## What I checked and found sound

Stated so the owner does not pay to have it re-audited.

**Password handling — `common/password.ts`.** scrypt at N=16384/r=8/p=1 with a 16-byte random
salt and a self-describing stored format; `maxmem` raised to 64 MB so the cost parameters
actually apply rather than silently erroring. `verifyPassword` derives to `expected.length` and
uses `timingSafeEqual` with lengths equal by construction, and returns `false` (never throws)
for every malformed input including the `'!'` written by the credentials migration. Generated
passwords use `randomBytes` over a 55-character alphabet; the modulo bias at 55 is negligible.
No issues.

**Session tokens — `common/session-token.ts`.** HS256, `algorithms: ["HS256"]` pinned on verify
(so `alg:none` and the RS256-confusion trick are both closed), secret required at >=32 chars or
the module throws, every claim re-type-checked after `jwt.verify`, and any failure collapses to
`null` so a prober learns nothing. 12-hour default TTL. No issues.

**`SessionAuthGuard`.** Re-reads the `app_user` row on *every* request and re-checks `active`
and `tokenVersion`, so a signed but stale token is refused. One indexed PK lookup — cheap, and
it is what makes revocation immediate rather than eventual. Single error message across
"deleted", "revoked" and "stale". No issues.

**`RolesGuard`.** Correct, and — importantly — I verified it is not silently doing nothing.
It reads handler-level metadata only, so a controller-level `@Roles` would be ignored; I walked
every route in the codebase and **all 47 handlers on all 15 guarded controllers carry a
handler-level `@Roles`**. The only two routes without one are `POST /auth/login` (intentionally
public) and `GET /auth/me` + `POST /auth/change-password` (session-guarded, correctly no role
requirement). No gaps.

**Login flow — `auth/auth.service.ts`.** Verifies against a real fixed dummy scrypt hash when
the user does not exist, so timing does not distinguish a real username; one error message for
unknown/wrong/revoked; `publicUser()` never returns `passwordHash` or `tokenVersion`;
`changePassword` bumps `tokenVersion` (signing out every other device) and hands back a fresh
token so the caller is not signed out of their own change. No issues.

**Privilege escalation around the owner role — `admin/provision-user.service.ts`.** I traced
every path specifically looking for a way for a manager or admin to reach `owner`. There is
none:
- Granting `owner` requires being one (line 51-53).
- Changing an existing owner's role requires being one (line 66-68).
- An owner cannot demote themselves (line 73-75) — no lockout.
- `revoke`, `reinstate` and `resetPassword` each independently re-check
  "only an owner may act on an owner" (lines 128-133, 147-150, 163-166).
- Self-revoke is blocked (line 125-127).
- `findInFactory` (line 187-190) scopes every target lookup by `factoryId`, so an owner cannot
  act on another factory's users by guessing an id.
- The username-taken check (line 60-62) deliberately does not reveal which factory holds it.
- Every check runs before any write, so a refused request has no side effects.
- Revoke sets `active: false` **and** bumps `tokenVersion`, so a walked-out employee loses
  access on their very next tap, not at token expiry. Reinstate issues a fresh password rather
  than restoring the old one.

This is the strongest part of the codebase. I found nothing to fix here.

**Copilot execution path — `copilot.service.ts:182-202`.** `BEGIN` → parameter-bound
`set_config('app.current_factory_id', $1, true)` → `SET LOCAL statement_timeout = '5s'` →
query → `COMMIT`, with `ROLLBACK` in `catch` and `client.release()` in `finally`. The
transaction-scoped (`true`) third argument is what makes this safe on a pooled connection, and
`factoryId` is never string-interpolated. `REVIEW-FEEDBACK.md` records an independent live test
of exactly this against real Postgres; the code still matches what was verified. The 5s
statement timeout also caps the `pg_sleep`-style DoS that the keyword blocklist does not catch.

**SQL validator, apart from M-3.** Stacked-statement rejection, leading-comment stripping
before the SELECT/WITH check, keyword scan over the *whole* body including comments and string
literals (fails closed), automatic `LIMIT 500` append. I checked the `\blimit\b` guard against
`credit_limit` — `_` is a word character, so no false skip. Solid defense-in-depth.

**`CopilotReadinessService`.** Queries `pg_class`/`pg_policies` directly rather than trusting
migration history, and fails only its own module rather than the app. The 39-table expectation
list matches the migrations. Good design.

**RLS policies themselves.** All 35 policies read correctly. `NULLIF(current_setting(...,
true), '')` returns NULL when unset, and `x = NULL` is never true, so an unscoped connection
gets zero rows — genuinely fail-closed. The TEXT-vs-uuid comparison note is accurate. The
`20260713020000_app_role_bypass_rls` migration is a correct no-op with a conditional cleanup
that cannot fail on a database where it does not apply.
**Caveat, stated plainly:** RLS constrains `stoneos_copilot_ro` and nothing else. The app owns
the tables and RLS is not FORCEd, so the main application path — which is where all 30 staff
live — is unprotected by it. That is documented and intentional, and it is the correct trade
(FORCE required BYPASSRLS required superuser). It just means every finding above stands on its
own with no database-level backstop.

**Correct tenant scoping, verified site by site.** `expense.service.ts:82-100` (a `SELECT ...
FOR UPDATE` scoped by factory, then per-raw-block ownership validation — the best-written
method in the repo), `inventory-movement.service.ts:171-199`, `raw-block.service.ts:330-340`
and `:345`/`:378`, `slab.service.ts:23,36`, `opening-inventory.service.ts` (`loadDraft` gates
every mutation; `removeLine` scopes by the verified snapshot), `machine-log.service.ts:15`
(the check itself is right — see H-1 for what undoes it), `polishing-session.service.ts:39-43`
(slab ownership), `sales-order.service.ts:77` (slab ownership), `cutting-session.service.ts:73`
and `:156`. The `include` on every read path is factory-scoped at the root. There is no
"list everything" query anywhere, as the README claims.

**XXE — not applicable.** `fast-xml-parser`'s `XMLParser` does not process DTDs or resolve
external entities at all, so the classic `SYSTEM "file:///etc/passwd"` attack has nothing to
act on here. The encoding sniffer in `decodeTallyXml` (`tally-import.service.ts:8-35`) decides
from raw bytes and handles all three BOMs correctly. The real upload risks are size and
regex cost (H-3), not entity expansion.

**HTTP security headers — `common/http-security.ts:39-49`.** `nosniff`, `X-Frame-Options:
DENY`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, HSTS in production,
and `CSP: default-src 'none'; frame-ancestors 'none'; base-uri 'none'` — appropriate for a
JSON API. `x-powered-by` disabled in `main.ts:30`.

**CORS — `common/cors.ts`.** Comma-separated explicit origin allow-list, no wildcard, no
`credentials: true` (correct, since auth is a Bearer header). Falls back to
`http://localhost:3000`, and `startup-checks.ts:88-95` warns when `FRONTEND_URL` is unset.

**Startup checks — `common/startup-checks.ts`.** Fatal on missing `DATABASE_URL` or a
missing/short/placeholder `SESSION_SECRET`; `process.exit(1)` rather than throwing, so the
operator reads a named variable instead of a stack trace. `MIN_SESSION_SECRET_LENGTH` is
deliberately duplicated rather than imported from the module it validates — correct instinct.
Copilot variables warn rather than kill the app.

**Health endpoints — `health.controller.ts`.** `/health/live` never touches the database;
readiness returns no driver error text (which can carry the connection string). Correct — the
only problem is that Northflank isn't configured to call it (L-4).

**Frontend session — `lib/session.tsx`.** A stored token is treated as a claim to verify, not
proof: `/auth/me` re-runs the full guard on load and the token is discarded on any non-OK
response — including on network failure, which is the conservative choice. `localStorage`
access is wrapped in try/catch for Safari private mode. `logout` clears storage and state.
No token ever appears in a URL, and `lib/api.ts:21` sends it as a Bearer header only.
The admin page's client-side role gate is UX only, with real enforcement server-side — which
is what the README says and what I confirmed.

---

## Suggested order of work

1. H-1 — reorder five spreads so server fields win. Smallest fix, largest structural payoff.
2. H-2 — pass `factoryId` into `upsertDayLog` and scope the lookup.
3. H-3 — add `limits: { fileSize }` to both `FileInterceptor`s; fix the `Math.min` spread.
4. Configure the Northflank health check against `GET /health/live` (endpoint already exists).
5. M-5 — confirm `req.ip` is the real client IP on the live deployment.
6. M-2 — assert the Copilot pool's role at startup.
7. M-1 — four ownership checks, matching the pattern already used six times elsewhere.
8. `next` → 16.2.11+ (patch). Schedule `@nestjs/platform-express` 12 separately (major).
9. M-3, M-4, L-1, L-2 as capacity allows.

Items 1, 2 and 7 are the ones that must be done **before** a second factory is ever
provisioned. Until then they are latent.
