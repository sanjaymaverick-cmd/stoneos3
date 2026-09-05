# Role & Workflow Runtime Tests — StoneOS3 — 2026-09-05

Branch `pwa-mobile` @ `50dd143`. Target: the **live** Northflank deployment
(`https://p01--stoneos-api--fpd9p2zcyzpc.code.run`), with the owner's explicit
authorisation to create mock data there.

Method: real HTTP requests only. **Nothing connected to Postgres**, nothing was
deleted, and no row that existed before this run was updated or overwritten. The
one exception to "created by me" is the six pre-existing rows I read (1 factory,
2 machines, 1 owner account) — those were read, never written.

Companion to `handoff/SECURITY-AUDIT-2026-09-05.md`, which found these issues by
reading the code. This document says which of them **actually happen** when you
send the request.

Reusable suite: `packages/backend/test/role-workflows.spec.ts` (left in the
working tree, uncommitted). It reads its base URL and credentials from the
environment and never hardcodes them.

---

## 1. Lead finding — where runtime enforcement is weaker than the policy claims

**The role layer is exactly as strong as `role-policy.ts` says. The field layer
is not a layer at all.**

322 role×endpoint authorization checks (46 endpoints × 7 roles) produced **zero**
discrepancies — every 403 the policy implies was returned, and no role reached
anything it should not. `RolesGuard`, `SessionAuthGuard`, revocation and the six
ownership gates in `provision-user.service.ts` all behaved exactly as written.

But once a request is *past* the role check, the body is trusted completely.
All four mass-assignment findings reproduce, from the lowest role in the system:

| # | What an **operator** or **supervisor** can do today, live | Confirmed |
|---|---|---|
| 1 | Choose the primary key of a `daily_production_report` row (`id` in the body) | Yes |
| 2 | Create a slab already in `salesStatus: "sold"` — **with no `SlabStateTransition` row behind it** | Yes |
| 3 | Set `isBackfilled: true` on a slab, making a hand-typed row look system-imported | Yes |
| 4 | Post a machine runtime log against machine **A** (which passes the ownership check) and have it written against machine **B** | Yes |
| 5 | Post a cutting day-log to session **A**'s URL and have it written into session **B** | Yes |
| 6 | Put an arbitrary `factoryId` into the query the database executes | Yes — blocked only by the FK, and only because there is one factory |

Number 2 is the one with money attached. `POST /slabs` with
`{"salesStatus":"sold"}` produces a slab whose `transitions` array is `[]` — the
inventory ledger and the state-transition audit trail simply never see it. The
same request with `salesStatus: "delivered"` also succeeds. A supervisor can
therefore write finished goods out of existence without a sale, and nothing in
the audit trail records that it happened.

Number 4 is the sharpest: `machine-log.service.ts` performs a tenant ownership
check on the URL's `machineId` and then writes the *body's* `machineId`. The
check runs and is then discarded.

Every one of these is a **one-line reorder** (server fields after the spread) or
an explicit field pick. There is still no `ValidationPipe` and no DTO layer.

**Second lead finding (new, not in the static audit):** the missing DTO layer
also means unknown or wrong-typed body keys reach Prisma and surface as
**HTTP 500**, not 400. Twelve endpoints returned 500 for an *authorized* role
sending `{}`. During seeding, `runtimeHours` (a field that does not exist on
`machine_runtime_log`; the column is `runtimeMinutes`) produced a bare
`{"statusCode":500,"message":"Internal server error"}` with no indication of
what was wrong. This is a usability and log-noise problem now, and it is the
same root cause as the mass-assignment class.

---

## 2. Static findings: confirmed vs. not reproduced

| Static finding | Verdict | Evidence |
|---|---|---|
| **H-1** `dpr.service.ts:44` — body sets `factoryId` | **CONFIRMED** | `POST /dpr` (operator) with a foreign `factoryId` → **500**, an FK violation. A 500 proves the body value was placed in the INSERT; an ignored key would have returned 201. |
| **H-1** `dpr.service.ts:44` — body sets `id` | **CONFIRMED** | Body `id: 637f6427-…` → row created with exactly that id. |
| **H-1** `dpr.service.ts:44` — body sets `isDerived` | **NOT REPRODUCED — audit is wrong here** | `create: { …, ...fields, isDerived: false }` puts `isDerived` **after** the spread. Body `isDerived:true` → row stored with `isDerived: false`. Only `id` and `factoryId` (declared before the spread) are reachable. |
| **H-1** `slab.service.ts:31` — body sets `factoryId` | **CONFIRMED** | Foreign `factoryId` → 500 FK violation (value reached the DB). |
| **H-1** `slab.service.ts:31` — body sets `salesStatus` | **CONFIRMED** | Slab `QA-ROLETEST-0905/MA/2` created directly as `sold`, `transitions: []`. `MA/3` created as `delivered` + `isBackfilled: true`. |
| **H-1** `machine-log.service.ts:24` — body sets `machineId` | **CONFIRMED** | `POST /machines/<B-21>/log` with body `machineId: <LPM>` → row written with `machineId = LPM`. The ownership check on B-21 passed and was then irrelevant. |
| **H-1** `cutting-session.service.ts:116` — body sets `cuttingSessionId` | **CONFIRMED** | `POST /cutting-sessions/<A>/day-log` with body `cuttingSessionId: <B>` → row written under session **B**. |
| **H-2** day-log has no tenant scoping at all | **CONFIRMED** | `POST /cutting-sessions/<random-uuid>/day-log` → **500** (FK violation), not 404. A scoped `findFirstOrThrow({ id, factoryId })` — which sibling `complete()` does have — would have produced 404. The service never looks the session up. |
| **M-1** unchecked foreign-key ids (customer, vehicle, machine ×2, supplier) | **CONFIRMED as un-checked; unreachable today** | All five `create` paths accept a foreign UUID and fail with a raw **500 FK violation** rather than a 400/404 from an ownership guard. No application-level check exists; the database is the only thing stopping them. With one factory there is no second tenant's id to supply. |
| **H-3** unbounded upload / `Math.min(...dates)` RangeError | **DELIBERATELY NOT TESTED** | Confirming it means pushing a large file at a single-process production backend with no health check. That is an outage, not a test. Reproduce it against a scratch instance. `FileInterceptor("file")` still carries no `limits` — the static finding stands on code reading. |
| **Auth is sound** (scrypt, JWT, guards, revoke path) | **CONFIRMED** | See §4. Token tampering, revocation, tokenVersion and password-change invalidation all behaved correctly. |
| **provision-user.ts — all six gates hold** | **CONFIRMED, all six** | See §5. |

---

## 3. Role × endpoint matrix — zero discrepancies

Bodies were sent empty (`{}`) so that `RolesGuard`, which runs before the
handler, is what decides: an **authorized** role fails validation (4xx/5xx), a
**denied** role gets 403. Nothing was created by this sweep.

Legend: `403` = denied, anything else = reached the handler. `own` owner ·
`adm` admin · `mgr` manager · `sup` supervisor · `opr` operator · `acc`
accountant · `aud` auditor.

| Endpoint | Policy group | own | adm | mgr | sup | opr | acc | aud | Match |
|---|---|---|---|---|---|---|---|---|---|
| `GET /dpr` | ANY_PROVISIONED | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ok |
| `GET /machines` | ANY_PROVISIONED | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ok |
| `GET /cutting-sessions` | ANY_PROVISIONED | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ok |
| `GET /cutting-sessions/active` | ANY_PROVISIONED | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ok |
| `GET /polishing-sessions` | ANY_PROVISIONED | 200 | 200 | 200 | 200 | 200 | 200 | 200 | ok |
| `GET /raw-blocks` | SALES_READ | 200 | 200 | 200 | 200 | **403** | 200 | 200 | ok |
| `GET /raw-blocks/recovery-ratio` | SALES_READ | 200 | 200 | 200 | 200 | **403** | 200 | 200 | ok |
| `GET /slabs` | SALES_READ | 200 | 200 | 200 | 200 | **403** | 200 | 200 | ok |
| `GET /customers` | SALES_READ | 200 | 200 | 200 | 200 | **403** | 200 | 200 | ok |
| `GET /sales-orders` | SALES_READ | 200 | 200 | 200 | 200 | **403** | 200 | 200 | ok |
| `GET /daily-sales-summary` | SALES_READ | 200 | 200 | 200 | 200 | **403** | 200 | 200 | ok |
| `GET /inventory-locations` | SALES_READ | 200 | 200 | 200 | 200 | **403** | 200 | 200 | ok |
| `GET /inventory-movements` | SALES_READ | 400 | 400 | 400 | 400 | **403** | 400 | 400 | ok |
| `GET /inventory-movements/on-hand` | SALES_READ | 200 | 200 | 200 | 200 | **403** | 200 | 200 | ok |
| `GET /opening-inventory` | SALES_READ | 200 | 200 | 200 | 200 | **403** | 200 | 200 | ok |
| `GET /vehicles` | EXPENSE_DATA | 200 | 200 | 200 | 200 | **403** | 200 | **403** | ok |
| `GET /expenses` | EXPENSE_DATA | 200 | 200 | 200 | 200 | **403** | 200 | **403** | ok |
| `GET /expenses/categories` | EXPENSE_DATA | 200 | 200 | 200 | 200 | **403** | 200 | **403** | ok |
| `GET /tally-import/batches` | COMMERCIAL_DATA | 200 | 200 | 200 | 200 | **403** | 200 | **403** | ok |
| `GET /tally-import/item-cross-check` | COMMERCIAL_DATA | 200 | 200 | 200 | 200 | **403** | 200 | **403** | ok |
| `GET /admin/users` | USER_MANAGEMENT | 200 | 200 | 200 | **403** | **403** | **403** | **403** | ok |
| `POST /dpr` | PRODUCTION_INPUT | 500 | 500 | 500 | 500 | 500 | **403** | **403** | ok |
| `POST /machines/:id/log` | PRODUCTION_INPUT | 500 | 500 | 500 | 500 | 500 | **403** | **403** | ok |
| `POST /cutting-sessions` | PRODUCTION_INPUT | 400 | 400 | 400 | 400 | 400 | **403** | **403** | ok |
| `POST /cutting-sessions/:id/day-log` | PRODUCTION_INPUT | 500 | 500 | 500 | 500 | 500 | **403** | **403** | ok |
| `POST /cutting-sessions/:id/complete` | PRODUCTION_INPUT | 400 | 400 | 400 | 400 | 400 | **403** | **403** | ok |
| `POST /polishing-sessions` | PRODUCTION_INPUT | 400 | 400 | 400 | 400 | 400 | **403** | **403** | ok |
| `POST /slabs/:id/transition` | PRODUCTION_INPUT | 500 | 500 | 500 | 500 | 500 | **403** | **403** | ok |
| `POST /raw-blocks/:id/transition` | PRODUCTION_INPUT | 500 | 500 | 500 | 500 | 500 | **403** | **403** | ok |
| `POST /raw-blocks` | INVENTORY_DATA | 500 | 500 | 500 | 500 | **403** | **403** | **403** | ok |
| `POST /slabs` | INVENTORY_DATA | 500 | 500 | 500 | 500 | **403** | **403** | **403** | ok |
| `POST /inventory-movements` | INVENTORY_DATA | 400 | 400 | 400 | 400 | **403** | **403** | **403** | ok |
| `POST /raw-blocks/:id/reconcile` | RECONCILIATION | 400 | 400 | 400 | **403** | **403** | 400 | **403** | ok |
| `POST /customers` | SALES_DATA | 500 | 500 | 500 | 500 | **403** | **403** | **403** | ok |
| `POST /sales-orders` | SALES_DATA | 400 | 400 | 400 | 400 | **403** | **403** | **403** | ok |
| `POST /expenses` | EXPENSE_DATA | 400 | 400 | 400 | 400 | **403** | 400 | **403** | ok |
| `POST /expenses/:id/allocate` | EXPENSE_DATA | 500 | 500 | 500 | 500 | **403** | 500 | **403** | ok |
| `POST /vehicles` | EXPENSE_DATA | 500 | 500 | 500 | 500 | **403** | 500 | **403** | ok |
| `POST /tally-import/daybook` | HISTORICAL_IMPORT | 400 | 400 | 400 | **403** | **403** | **403** | **403** | ok |
| `POST /tally-import/trial-balance` | HISTORICAL_IMPORT | 400 | 400 | 400 | **403** | **403** | **403** | **403** | ok |
| `POST /daily-sales-summary/backfill` | HISTORICAL_IMPORT | 500 | 500 | 500 | **403** | **403** | **403** | **403** | ok |
| `POST /opening-inventory` | HISTORICAL_IMPORT | 500 | 500 | 500 | **403** | **403** | **403** | **403** | ok |
| `POST /inventory-locations/seed-defaults` | USER_MANAGEMENT | 201 | 201 | 201 | **403** | **403** | **403** | **403** | ok |
| `POST /inventory-movements/:id/reverse` | USER_MANAGEMENT | 400 | 400 | 400 | **403** | **403** | **403** | **403** | ok |
| `POST /admin/users` | USER_MANAGEMENT | 400 | 400 | 400 | **403** | **403** | **403** | **403** | ok |
| `POST /copilot/ask` | owner only | 400 | **403** | **403** | **403** | **403** | **403** | **403** | ok |

**Total discrepancies: 0 / 322.**

Side observation from the same sweep: twelve endpoints answer an authorized
role's malformed request with **500** rather than 400 (marked above). See §1.

---

## 4. (d) Revocation immediacy — CONFIRMED sound

| Step | Expected | Actual |
|---|---|---|
| `GET /auth/me` with auditor's token, before revoke | 200 | 200 |
| Owner `POST /admin/users/<auditor>/revoke` | 200 | 200 |
| **Same token**, `GET /auth/me`, next request | 401 | **401** `Session is no longer valid` |
| **Same token**, `GET /slabs` | 401 | **401** |
| Revoked user re-logs in with old password | 401 | **401** `Invalid username or password` |
| Owner reinstates (issues new password) | 200 | 200 |
| Pre-revocation token after reinstate | 401 (tokenVersion bumped again) | **401** |
| Fresh login with the reinstate password | 200 | 200 |

Also verified in the same block:

- **Self-service password change** invalidates the token that performed it —
  the very next request on that token returns 401.
- **Role changes are live on existing tokens.** An operator's token returned 403
  on `GET /admin/users`; the owner promoted that account to manager; the *same
  unchanged token* then returned 200; after demotion it returned 403 again. The
  guard re-reads the row and ignores the token's own `role` claim — correct.
- **Token tampering.** Editing the payload to `role: "owner"` and reusing the
  original signature → 401 `Invalid session token`. Garbage token → 401. No
  Authorization header → 401 `Missing session token`.

The token payload is `{sub, username, factoryId, role, tv, iat, exp}` with a
12-hour expiry. `role` and `factoryId` in the claims are decorative — the guard
uses the database row.

---

## 5. (c) Privilege escalation — all six gates hold

To avoid ever aiming a demotion or revocation at the real owner, I first created
a **sacrificial second owner**, `qatest-owner2`, and used that as the target.
**Action required: the owner should revoke `qatest-owner2` when finished
reviewing this** (see §7).

| Probe | Expected | Actual |
|---|---|---|
| manager → create new user with `role: "owner"` | 403 | **403** "Only an owner can grant the owner role." |
| admin → create new user with `role: "owner"` | 403 | **403** same |
| manager → promote **self** to owner | 403 | **403** same |
| admin → promote **self** to owner | 403 | **403** same |
| manager → promote an operator to owner | 403 | **403** same |
| manager → demote `qatest-owner2` to manager | 403 | **403** "Only an owner can change another owner's role." |
| admin → demote `qatest-owner2` to operator | 403 | **403** same |
| owner2 → demote **self** to manager | 403 | **403** "You cannot remove your own owner role." |
| manager → revoke `qatest-owner2` | 403 | **403** "Only an owner can revoke another owner." |
| admin → revoke `qatest-owner2` | 403 | **403** same |
| manager → reinstate `qatest-owner2` | 403 | **403** "Only an owner can reinstate another owner." |
| manager → reset `qatest-owner2` password | 403 | **403** "Only an owner can reset another owner's password." |
| admin → reset `qatest-owner2` password | 403 | **403** same |
| manager → revoke **self** | 403 | **403** "You cannot revoke your own access." |
| admin → revoke **self** | 403 | **403** same |
| owner2 → revoke **self** | 403 | **403** same |
| **real owner** → revoke **self** | 403 | **403** same |
| owner → provision `role: "inventory"` (not in `SCHEMA_ROLES`) | 400 | **400** with the valid list |
| supervisor / operator / accountant / auditor → `GET` and `POST /admin/users` | 403 | **403** ×8, from `RolesGuard` |

**By design, but worth stating plainly** — the *only* thing the escalation gates
protect is the `owner` role. Within the elevated tier everything else is open:

- A **manager created a brand-new `admin` account** (`qatest-mgrmadeadmin`),
  successfully.
- An **admin promoted an operator to manager** and back, successfully.
- A **manager reset the `qatest-admin` account's password** and received the new
  plaintext in the response — i.e. any manager can take over any admin or peer
  manager account at will. It cannot climb to `owner`, so this is lateral, not
  vertical. Given `role-policy.ts` explicitly declares admin a *peer* of
  manager, this is consistent with the documented intent — but if "admin" is
  ever meant to outrank "manager", these three lines are where it breaks.
- A body `factoryId` on `POST /admin/users` is correctly **ignored** — the
  controller passes `user.factoryId` and never spreads the body. This is the
  one write path in the app that gets it right, and it is the model the other
  five should copy.

---

## 6. Tally import (Task 3) — format, behaviour, and how it handles bad input

Mock files were built from the parser in
`packages/backend/src/modules/tally/tally-import.service.ts`, covering all three
ledger-entry structures the parser documents.

**What imported successfully**

| File | Result |
|---|---|
| `daybook.xml` — 12 vouchers (6 Sales in item-invoice mode, 6 Payment in account-invoice mode), 1 Apr – 2 Sep 2026, UTF-8 | 201 · 24 ledger entries, 12 voucher items, period correctly inferred as 2026-04-01 → 2026-09-02 |
| `daybook-utf16.xml` — byte-identical content re-encoded UTF-16LE with BOM | 201 · identical counts. **The encoding sniffing works.** |
| `trialbalance.xml` — 6 accounts in the `DSPACCNAME`/`DSPACCINFO` alternating shape | 201 · 6 accounts |

`ACTUALQTY` of `"1,800 SQF"` parsed as `1800`, not `2` — the thousands-separator
fix in `parseTallyQuantity` works.

**How it handles malformed input** — three inputs produce a 500 instead of a 400:

| Input | Result | Verdict |
|---|---|---|
| Plain prose, not XML | 400 "No TALLYMESSAGE/VOUCHER data found…" | good |
| Right envelope, wrong contents | 400, same message | good |
| Empty (0-byte) file | 400, same message | good |
| Vouchers with `<DATE>` removed | 400 "found zero ledger entries" | good |
| **XML truncated mid-element** | **500 Internal server error** | **bug** — `fast-xml-parser` throws and nothing catches it |
| **`<DATE>NOTADATE</DATE>`** | **500 Internal server error** | **bug** — `parseTallyDate` yields an Invalid Date, which propagates into `Math.min(...)`/Prisma |
| Wrong multipart field name | 400 "Unexpected field" | good |
| No file at all | 400 "field name must be 'file'" | good |
| Prose to `/trial-balance` | 400 "found zero accounts" | good |

`GET /tally-import/item-cross-check`:

| Call | Result |
|---|---|
| `from=2026-04-01&to=2026-10-05` | 200 · `{tallySqft: 24900, stoneosSqft: 544.5, delta: 24355.5}` |
| `from=2026-09-01&to=2026-10-05` | 200 · `{tallySqft: 0, stoneosSqft: 544.5, delta: -544.5}` |
| `from` only | 400, clear message — good |
| **`from=hello&to=world`** | **500 Internal server error** — an Invalid Date goes straight into the Prisma `gte`/`lte`. Should be a 400. |

**Additional finding — duplicate imports are silently additive.** I uploaded the
same daybook twice (once UTF-8, once UTF-16). Both succeeded, each created its
own batch, and `item-cross-check` then reported **24,900 sqft where the file
contains 12,450** — exactly double. There is no content hash, no source-file
uniqueness constraint, and no warning. A user who re-uploads a month "to be
safe" doubles that month's Tally figures and nothing in the UI says so. For a
reconciliation tool this is the most consequential Tally issue found.

**Also noted:** there is **no supplier endpoint at all**. No `@Controller` in the
codebase serves `/suppliers`, yet `POST /raw-blocks` accepts a `supplierId` and
`RawBlock.supplier` is a real relation. Suppliers can be referenced but not
created through the API. The seeded blocks therefore carry `supplierId: null`.

---

## 7. What I created — marker and inventory

**Marker: `QA-ROLETEST-0905`.** It appears in customer names, vehicle names,
expense `toWhom`, all `notes` / `manualNotes` / `downtimeReason` / `wastageNotes`
fields, tally `sourceFile` names, and every test account's `name`. Raw blocks and
slabs additionally use the serial prefix **`QA0905-`**.

Everything below was created between 07:25 and 07:45 UTC on 2026-09-05.

| Entity | Count | How to find it |
|---|---|---|
| App users | 9 | usernames start `qatest-` |
| Customers | 2 | name starts `QA-ROLETEST-0905` |
| Vehicles | 2 | name starts `QA-ROLETEST-0905` |
| Raw blocks | 4 | `serialNumber` `QA0905-B1` … `B4` |
| Cutting sessions | 2 | both completed, on B-21 |
| Cutting day-logs | 4 | `notes` contains the marker (one of them is the mass-assignment probe row, deliberately written into the *wrong* session — see §2) |
| Slabs | 92 | 90 generated by session completion; 2 more (`QA-ROLETEST-0905/MA/2`, `/MA/3`) are the mass-assignment probes and are **deliberately in bogus states** (`sold` / `delivered` with no transition history). Treat those two as junk. |
| Polishing sessions | 3 | 1 grinding + 2 polishing, on LPM |
| Machine runtime logs | 6 | `downtimeReason` contains the marker. One (B-21 URL, 2026-10-05) was written against **LPM** by the mass-assignment probe. |
| DPR rows | 6 | `manualNotes` contains the marker; departments `cutting`, `polishing`, and one `packing` probe row |
| Sales orders | 2 | 11 line items total, 2026-09-20 and 2026-10-03 |
| Expenses | 5 | `toWhom` = `QA-ROLETEST-0905 vendor`; 1 allocation against block B1 |
| Inventory movements | 1 | `referenceType: "qa_seed"` |
| Inventory locations | 9 | created by `POST /inventory-locations/seed-defaults` — these are the app's standard set, previously unseeded. Keep them. |
| Tally import batches | 3 | `sourceFile` starts `QA-ROLETEST-0905-` · 48 ledger entries, 12 voucher items, 6 trial-balance rows |
| Daily sales summaries | 2 | derived automatically from the two sales orders |

**Date handling.** Where an endpoint takes a date it was spread across
5 Sep – 5 Oct 2026 as instructed (raw-block `purchaseDate`, cutting `startedAt` /
`endedAt`, day-log `operationalDate`, polishing `operationalDate`, DPR
`reportDate`, expense `expenseDate`, sales `orderDate`, machine-log `logDate`).
Where it does not, the timestamp is **"now" (2026-09-05)**: every `createdAt`,
`InventoryMovement.occurredAt` (no date parameter exists), all
`BlockStateTransition.occurredAt` / `SlabStateTransition.occurredAt`, and
`TallyImportBatch.importDate`.

### Generated test credentials

These are one-time passwords that cannot be retrieved again. Several changed
during testing (revoke/reinstate, password-change and manager-reset probes) —
the values below are the ones **currently valid**, each verified by a fresh
login at the end of the run.

| Username | Role | Current password | Note |
|---|---|---|---|
| `qatest-manager` | manager | `mXntn6oyd4Gt` | |
| `qatest-supervisor` | supervisor | `rLgCgqFZrNzq` | |
| `qatest-operator` | operator | `QaRotated0905x` | rotated by the self-service password-change test |
| `qatest-accountant` | accountant | `sqPGhTW6UEFV` | |
| `qatest-auditor` | auditor | `tKJame4Uos8a` | revoked and reinstated by the §4 test; this is the reinstate password |
| `qatest-admin` | admin | `Jqkk47x4K9bv` | rotated by the "manager resets an admin" probe in §5 |
| **`qatest-owner2`** | **owner** | `RmsQnjrZ3xuo` | **sacrificial second owner — revoke this** |
| `qatest-mgrmadeadmin` | admin | `PCo7Tv8aSwjd` | created by a manager, to prove it is possible |
| `qatest-factinj` | operator | `siCpDZfJmSHP` | created to prove a body `factoryId` is ignored on `/admin/users` |

**Recommended cleanup, in this order** (the app has no delete; revoke is the
correct disposal):

1. `POST /admin/users/<qatest-owner2 id>/revoke` — as the real owner. Do this
   first; it is the only non-`sanjay` account with owner authority.
2. Revoke `qatest-mgrmadeadmin` and `qatest-factinj` — throwaway probe accounts.
3. Revoke the six role accounts when the suite is no longer needed. Leaving them
   active is fine while testing continues; the suite is idempotent and will
   reuse them.
4. Slabs `QA-ROLETEST-0905/MA/2` and `/MA/3` are in states the state machine
   would never produce. There is no delete endpoint; the honest fix is to leave
   them and treat the `QA-ROLETEST-0905/` serial prefix as excluded from any
   real inventory count, or to include them in whatever cleanup the mass-
   assignment fix ships with.

**I did not delete, update or overwrite a single pre-existing row.** The nine
inventory locations were created by an idempotent seed endpoint that had never
been run. The 2 machines, 1 factory and the `sanjay` account were read only.

---

## 8. The test suite

`packages/backend/test/role-workflows.spec.ts` — left in the working tree,
**not committed**.

```bash
cd packages/backend
STONEOS_API_URL=https://p01--stoneos-api--fpd9p2zcyzpc.code.run \
STONEOS_OWNER_USERNAME=... \
STONEOS_OWNER_PASSWORD=... \
  npx jest --rootDir . --testRegex "test/.*\.spec\.ts$" --runInBand
```

The explicit `--rootDir`/`--testRegex` are required: `package.json`'s jest config
sets `rootDir: "src"`, so `npm test` will not see this file. That is deliberate —
this suite hits a live deployment and must never run as part of a normal unit
test pass.

Configuration is entirely environmental: `STONEOS_API_URL`,
`STONEOS_OWNER_USERNAME`, `STONEOS_OWNER_PASSWORD`, plus optional
`STONEOS_TEST_PREFIX` (default `qatest-`) and `STONEOS_MARKER` (default
`QA-ROLETEST`). **No credential or hostname is written in the file.**

Safety properties built in:

- `assertOwnedAccount()` throws before any revoke, reset-password or role change
  whose target's username does not start with the configured prefix. The real
  owner can never be a target.
- Nothing is ever deleted.
- The role matrix sends empty bodies, so it creates no rows.
- User provisioning is idempotent: existing `qatest-*` accounts are reused via
  `reset-password` rather than duplicated.
- A rate-limit-aware fetch backs off on 429 and idles when the per-IP budget
  (120 req/60 s) runs low — the matrix alone is ~320 requests.
- **The unbounded-upload finding (H-3) is deliberately not exercised.** A
  comment in the file says why.

The mass-assignment and day-log-scoping tests assert the **desired** behaviour,
so they **fail today**. That is intentional: they are the regression tests for
the fix. Nine assertions currently fail — seven in `(a)`, one in `(b)`, two in
the tally malformed-input block. Everything in `(c)`, `(d)` and `(e)` passes.

---

## 9. Priority order

1. **Reorder the five mass-assignment spreads** (`dpr.service.ts:44`,
   `slab.service.ts:31`, `machine-log.service.ts:24`,
   `cutting-session.service.ts:116`, plus the two update paths). Server fields
   after the spread, or an explicit field list. Five one-line changes; the
   regression tests are already written. Fixes the confirmed slab-to-`sold`
   bypass immediately, not just the future tenant boundary.
2. **Scope the cutting day-log by factory** —
   `findFirstOrThrow({ where: { id, factoryId } })` before the upsert, copying
   `complete()` at line 156. Also turns the current 500 into a 404.
3. **Add the DTO layer + `ValidationPipe`** that `main.ts:36-40` defers. It is
   the structural fix for both items above *and* for the twelve endpoints that
   answer a bad body with 500.
4. **Deduplicate Tally imports** — hash the file or make `sourceFile` unique per
   factory, and warn on re-upload. Today a repeat upload silently doubles the
   period's figures.
5. **Catch the three Tally 500s** — parser throw, non-numeric `<DATE>`, and
   invalid `item-cross-check` bounds. All should be 400s.
6. **Cap the upload** (`limits: { fileSize: 25MB, files: 1 }`) and replace
   `Math.min(...dates)` with a reduce. Not confirmed at runtime by choice; the
   code reading is unambiguous.
7. **Add the M-1 ownership guards** before a second factory exists — five
   `findFirst({ where: { id, factoryId } })` calls. Nothing to fix today, but
   they are the difference between a bad request and a cross-tenant read the
   day tenancy is real.
8. Add a `/suppliers` endpoint, or drop `supplierId` from the raw-block API.
   Right now the field can only ever be null.
