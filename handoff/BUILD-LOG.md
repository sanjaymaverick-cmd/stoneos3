# Build Log
*Owned by Architect. Updated by Builder after each step.*

---

## Current Status

**Active step:** none — Steps 5A, 5B, 5C all cleared and merged 2026-07-12 (built in parallel in
isolated worktrees `worktrees/recovery-ratio-report`, `worktrees/slab-dimension-overrides`,
`worktrees/tally-item-detail`). Step 5D (Next.js 15→16 upgrade) still in review in its own
worktree, `worktrees/nextjs-16-upgrade` — merges last per plan.
**Last cleared:** Steps 5A/5B/5C — each independently reviewed clean (0 Must Fix), merged to
`main` via `--no-ff` merge commits, verified with a full `tsc --noEmit` + `npm run build` pass
in both packages AFTER merging (not just per-branch) to confirm the three independently-built
changes integrate correctly together — all clean, `/recovery-ratio` and the grown `/dpr` bundle
both present in the build output as expected. Owner gave explicit go-ahead to merge these three
2026-07-12.
**Repo:** `origin` is `https://github.com/sanjaymaverick-cmd/stoneos3.git`. All local commits
through `48a1afa` (Steps 5A/5B/5C merged + brief reset) are pushed and confirmed matching
`origin/main`. CI/CD deploy workflow remains disabled (`deploy.yml.disabled`) — this push
triggered nothing.
**Bootstrap:** Run 2026-07-11 (`prisma/bootstrap.ts`, local Postgres) — `sanjay.maverick@gmail.com`
granted owner access to the existing "Vedam Granites" factory (`4485c4f7-...`), B-21/LPM
machines seeded. Fixed `bootstrap.ts` first to reuse an existing factory by name instead of
unconditionally creating one — the factory row already existed (from Step 1's backfill) with
2,421 Expense/514 DailySalesSummary rows linked to it, and running the script unmodified would
have created a duplicate factory and orphaned that data from the owner grant. Verified directly
against Postgres (not just script output): 1 factory, 2 machines, 1 app_user row, all correctly
linked.
**Pending deploy:** No production environment exists for this project — the old AWS deployment
(stoneos-db/ECS/ALB under the old `sos` remote) is out of scope entirely (2026-07-11 decision).
Historical-backfill execution against any future real environment is the Owner's own manual
responsibility, not the team's.

---

## Step History

### Step 1 — Historical backfill: expenses + daily sales summary — CONFIRMED LOCALLY
*Date: 2026-07-11*

Files changed:
- `packages/backend/prisma/backfill-historical.ts` (new) — parses `1. VEDAM PRODUCTION.xlsx`,
  prints per-month summary + reconciliation, dry-run only this step.
- `packages/backend/package.json` — added `xlsx` devDependency.

Decisions made:
- Scope limited to `Expense` + `DailySalesSummary` — historical production session data
  (CuttingSession/PolishingSession/CuttingDayLog) cannot be reconstructed from source data.
- Real file layout differs from the brief's described column order (order of QTY/SALE/EXP
  columns varies by block/sheet) — parser locates those by header text and relies on
  positionally-stable columns 7-26 for everything else. Verified by reconciling category-sum
  + unmapped PAYMENTS against each row's own TOTAL column (0.23% aggregate discrepancy).
  See `handoff/REVIEW-REQUEST.md` for full detail.
- Incorporated Architect's mid-task update: `dpr-daily/` (81 files) used as an independent
  day-level cross-check, and balance-sheet reconciliation extended to all 5 available months.
  Neither changes what gets written — still sourced only from `1. VEDAM PRODUCTION.xlsx`.
- `BS MONTH OF JUNE 2026.xlsx` + all `balance-sheets/*.xlsx` + `TrialBal.xml` used for
  reconciliation only, no DB writes.
- Full mapping and build order: see `handoff/ARCHITECT-BRIEF.md`.
- No Factory row exists yet in local Postgres (bootstrap.ts not run — requires live Clerk
  auth, out of scope) — dry run degrades gracefully instead of failing.

Reviewer findings: Richard found 2 Must Fix bugs (2026-07-11 review) — both fixed same day:
- Bike column (relative col 15) was double-counted: left in `FIXED_CATEGORY_COLS` (generic,
  untagged) AND handled again explicitly (tagged, `vehicleName: "Bike"`) — same cell counted
  twice. Fixed by removing the `FIXED_CATEGORY_COLS[15]` entry, mirroring col 14's existing
  exclusion. `vehicle` category corrected ₹1,494,690 → ₹1,430,184.
- `toWhom` was stamped onto every category row for a day instead of just the one it
  describes. Fixed by moving `toWhom` onto `CategoryHit` and setting it only on the
  `staff_salary` hit (from PAYMENTS) — scoped differently than the original code comment
  said ("misc/vehicle/bike"), since that comment predated the PAYMENTS→staff_salary
  decision and TO WHOM is column-adjacent to PAYMENTS, not MISC/vehicle/bike; see
  `handoff/REVIEW-REQUEST.md` for the full reasoning.
Also fixed inline (trivial, from Richard's Should Fix list): redundant `result.set()` call
in `parseDprDailyDir`. `unmappedPaymentsToWhom` was already gone (removed earlier same day).
Re-ran `--dry-run` post-fix: reconciliation against the yearly-data file is now a PERFECT
match (Δ0) for every month with a yearly-data row — the strongest validation signal yet that
both this fix and the earlier PAYMENTS/OFFICIAL reclassification are correct.

Deploy: `--confirm` run against LOCAL Postgres only, 2026-07-11, by the Architect directly
(see note below on how authorization was handled). Result: 2,420 Expense rows inserted,
514 DailySalesSummary rows upserted, factory "Vedam Granites" + vehicles "Nexon EV"/"Bike"
created. Reconciliation vs `4. VEDAM YEALY DATA.xlsx` is Δ0 for every month with a
yearly-data row (Oct 2023-Mar 2026); Apr-Jun 2026 show as deltas only because that sheet is
still blank for those months in the source file (not a bug). Tally salesregister/purchase
register/TrialBal deltas remain large and unresolved (KG-5, below) — reconciliation-only,
does not affect what was written. Production database has NOT been touched.

**Authorization note:** Bob (Builder) correctly refused to run `--confirm` on the grounds
that its only channel for Owner sign-off is a relay through the Architect, which cannot
satisfy a "direct user confirmation" bar by construction. After the Project Owner gave
several fresh, direct, explicit instructions in the live chat session (culminating in
"proceed with the local --confirm run"), the Architect executed the `--confirm` run
directly rather than continuing to relay through Bob. This is logged here plainly because
it is a deviation from the original one-agent-builds/one-agent-reviews flow, not something
to gloss over — the Project Owner was present and explicitly directing this in real time.

**Bob's independent verification (2026-07-11, read-only queries against local Postgres,
no writes):** confirmed via `prisma.expense.count`/`groupBy` and
`prisma.dailySalesSummary.count`/`aggregate` — Expense row count 2,420, DailySalesSummary
row count 514, matching the reported figures exactly. Sum-by-category matches the
post-fix dry-run prediction to the rupee for all 16 categories (total 105,220,193.00,
vehicle 1,430,184.00, loan_payment 31,798,091.00, staff_salary 4,556,472.00, etc.).
Vehicle-category rows with a null `vehicleId`: 0 — confirms Richard's bike-double-count fix
holds in the actual written data. Spot-checked 2025-09-02 against original source
inspection notes — exact match once correctly read (that day's qty/sale are genuinely 0;
the nonzero values at relative cols 1-2 are production-machine counts, not sale figures,
per that block's own header). One thing worth flagging now that it's real data, not a
hypothetical: only "Nexon EV" was created as a vehicle — no "Van (Isuzu)" — see KG-6 below.

### Step 2 — RawBlock opening-balance / entry-provenance support — BUILT, AWAITING REVIEW
*Date: 2026-07-11*

Files changed:
- `packages/backend/prisma/schema.prisma` — merged `_temp/raw-block-intake-draft/schema-additions.prisma`
  verbatim (additive fields on `RawBlock`/`Factory`/`CuttingSession`/`PolishingSession`/`Slab`,
  new `BlockReconciliation` model).
- `packages/backend/prisma/migrations/20260711114711_opening_balance_provenance/migration.sql`
  (new) — generated via `prisma migrate diff --from-url ... --to-schema-datamodel ...` (equivalent
  to `migrate dev --create-only`, which requires an interactive TTY not available in this
  session), with the brief's exact backfill `UPDATE raw_block ...` statement appended.
- `packages/backend/src/modules/inventory/raw-block.service.ts` — extended `create()` to branch on
  `entrySource` (purchase/opening_balance/transfer_in), added `reconcile()`, added private
  `validateTransferIn`/`validateMachineType` helpers.
- `packages/backend/src/modules/inventory/raw-block.controller.ts` — `create()` now passes the
  full `user` object (needed for role gating + audit fields); added `RolesGuard` at class level;
  added `POST :id/reconcile` gated with `@Roles("owner","admin","manager","accountant")`.

Decisions made — all per the brief's explicit corrections, verified against the real schema
before writing any code (see Builder Plan in `handoff/ARCHITECT-BRIEF.md` for the verification
list): `cuttingMachineId`/`polishingMachineId` split (not a single `machineId`, since
`CuttingSession.machineId` and `PolishingSession.machineId` are each required non-null FKs to
different machine types); `PolishingSession.operationalDate`/`finishType` both required and set
explicitly (`finishType` from `input.finish`, `operationalDate` defaulted to `new Date()`); no
`totalSlabsProduced` field — used `totalSlabsCut`/`finalGoodSlabCount` = `expectedTotalSlabs`,
`damagedSlabCount` = 0; `user.email` used everywhere the draft used `user.name`; manual
`@Body() body: any` + service-layer checks (no class-validator, matching
`expense.service.ts`); `create`'s entrySource-conditional role gate stayed a manual in-service
check (can't be expressed by the declarative `@Roles()`, which only reads route metadata, not
body content); `reconcile`'s always-elevated gate used the declarative `@Roles()` pattern,
matching `provision-user.controller.ts` exactly.

Added (Architect's own call per the brief, not from the draft): `validateTransferIn` — rejects
a `transfer_in` entry if `sourceFactoryId` doesn't resolve to a real `Factory` (404) or if
`transferredFromBlockId` is given but belongs to a different factory than `sourceFactoryId`
(400). Extended slightly beyond the brief's literal wording: also rejects `transferredFromBlockId`
given without `sourceFactoryId` (400) — there'd be no factory to validate consistency against
otherwise; flagging this as an addition for Richard to confirm is the right call.

Added (nice-to-have per the brief): `validateMachineType` checks `cuttingMachineId`/
`polishingMachineId` actually resolve to a `Machine` row of the matching `machineType`, rejecting
mismatches (400).

**Unexpected finding during migration apply, now resolved:** local Postgres had an orphaned
failed migration record, `20260711120000_factory_workflow_model` (0 steps applied, failed on
`CREATE TYPE "UserRole"` already existing), with no corresponding folder in
`prisma/migrations/` — unrelated to this step, origin unclear. Confirmed via read-only query
that it made zero changes to the `public` schema before blocking further deploys. Bob raised
this to the Architect rather than resolving it directly (touching shared migration-history
state wasn't within the originally approved plan); after direct Owner confirmation in chat, the
Architect ran `prisma migrate resolve --rolled-back` on it directly. Bob independently verified
the resolution via a read-only query (`rolled_back_at` populated) before proceeding, rather than
trusting the relayed claim — did not run the resolve command itself. Also noted in passing but
untouched: a wholly separate `codex_smoke` Postgres schema in the same DB instance with its own
duplicate `UserRole` enum — unrelated clutter, not part of the `public` schema this app uses.

Verification: `tsc --noEmit` clean, `npm run build` clean. Wrote and ran a throwaway smoke-test
script (`scratchpad/smoke-test-raw-block.js`, not committed) that exercises the compiled service
directly against local Postgres inside a disposable factory/machine set — 18/18 checks passed
(purchase legacy-shape create still works incl. new `fromState:null` transition; role gate
blocks non-elevated opening_balance/transfer_in; mid_cutting and finished_stock session/slab
reconstruction with correct field names and required-field validation; wrong-machine-type
rejection; transfer_in fabricated/mismatched-factory rejection; reconcile's estimated/confirmed
transition rule; unknown-fieldName rejection). Cleaned up all test rows afterward; confirmed via
direct query that Step 1's data (1 factory, 2,421 `Expense` rows) is untouched and `raw_block`
remains empty (expected — Step 1 never touched inventory tables).

No production database contact at any point.

#### Step 2 Round 2 — Richard's review fixes + transfer_in disabled
*Date: 2026-07-11*

Richard's `handoff/REVIEW-FEEDBACK.md` (Ready for Builder: NO) found 3 Must Fix bugs, all fixed
in `raw-block.service.ts`:
1. `entrySource` wasn't validated against an allowlist at runtime — a bogus value (or
   `"transfer_in"`, at the time) skipped both branch validations and fell through to
   `costStatus: "confirmed"`/`currentStatus: "in_stock"`. Fixed with an `ENTRY_SOURCES`
   allowlist check, same pattern as `RECONCILE_FIELDS`.
2. `validateMachineType` had no `factoryId` filter — the only unscoped `Machine` lookup in the
   codebase, letting an `opening_balance` intake reference another factory's machine. Fixed:
   takes `factoryId`, uses `findFirst({ where: { id: machineId, factoryId } })`.
3. `reconcile()`'s cost_status rule forced any block to `"confirmed"` on any correction, even
   one that was never `"estimated"` to begin with (e.g. an ordinary `"pending"` purchase
   block). Fixed: a block's existing `costStatus` is now left alone unless it was already
   `"estimated"`.

Should Fix taken: `startingState` now validated against its 3-value allowlist (was silently
defaulting to `raw_yard` on garbage input). A `sourceFactoryId === factoryId` guard was also
implemented, then removed again once the scope change below made `sourceFactoryId` a
no-longer-accepted input entirely.

**Scope change, Project Owner's direct decision, resolving Richard's "Escalate to Architect"
item:** *"no cross factory data transfer. all factories independent units. once we are ready
for multi factory setup in app we will add that in login process so no cross factory data leak
happens."* Implemented: `entrySource` allowlist is now only `["purchase", "opening_balance"]`
— `"transfer_in"` is rejected exactly like any other invalid value, no special case.
`validateTransferIn` deleted entirely (method + call site, not left as dead code).
`sourceFactoryId`/`transferredFromBlockId` removed from `CreateRawBlockInput` and from the
`rawBlock.create()` data object — the service no longer reads or writes either field, and no
code path queries another factory's `Factory`/`RawBlock` rows. Schema/migration deliberately
left untouched — `RawBlock.sourceFactoryId`/`transferredFromBlockId`/`transferredToBlocks` and
`Factory.blockTransfersOut` stay in place, additive and harmless, for whenever multi-factory
support is built properly at the login/access layer.

Verification: `tsc --noEmit` clean, `npm run build` clean. Updated and re-ran the smoke-test
script (dropped the transfer_in create-path cases, added regression checks for all 3 Must Fix
bugs + the transfer_in disable) — **24/24 checks passed**. Confirmed after cleanup that local
Postgres is back to exactly Step 1's state (1 factory, 2,421 Expense rows, raw_block empty). No
production database contact.

### Step 3 — Cost allocation for damaged slabs — CLEARED, AWAITING COMMIT
*Date: 2026-07-11*

Files changed:
- `packages/backend/src/modules/inventory/raw-block.service.ts` — `findOne` now `async`, adds
  `cuttingSessions: true` to its existing `include`, and attaches a computed `damagedSlabLoss`
  object (via new private `computeDamagedSlabLoss` helper) onto the returned block. Nothing
  persisted; `findAll` untouched.

Decisions made — all per the brief, no ambiguity requiring escalation:
- Cost basis: `actualAmountPaid` preferred, `invoicedAmount` fallback, `null` if neither —
  matches `Number(x)` Decimal-to-number conversion pattern already used in
  `expense.service.ts`/`daily-sales-summary.service.ts` (no `.toNumber()` elsewhere in the
  codebase, so followed existing precedent instead).
- `totalSlabsCut`/`damagedSlabCount` summed across every `CuttingSession` on the block where
  `totalSlabsCut` is not null (an `in_progress` session with nothing reported yet is excluded
  from the sum, not treated as zero) — covers the normal one-session case and the rarer
  multi-session case (e.g. a block re-cut or continued across two sessions) the same way.
- `costPerSlab`/`lossAmount` null-propagation exactly as specified: `costPerSlab` null if
  `totalCost` is null OR `totalSlabsCut` is 0; `lossAmount` null only if `costPerSlab` is null
  (a genuine 0 damaged-slab count still yields `lossAmount: 0`, not null).
- `findOne`'s prior behavior of returning `null` (unchanged, no `NotFoundException`) when no
  matching block exists was preserved exactly — added an explicit early return rather than
  letting `computeDamagedSlabLoss` run against `null`.

Verification: `tsc --noEmit` clean, `npm run build` clean (no output, no errors). Wrote and ran
a throwaway smoke-test script (`scratchpad/smoke-test-damaged-slab-loss.js`, not committed)
against local Postgres in a disposable factory/machine — **24/24 checks passed**, covering: cost
basis preference (actual over invoiced) and fallback (invoiced when actual is null); zero
damaged slabs (`lossAmount: 0`, not null); no cost recorded (`costBasis`/`costPerSlab`/
`lossAmount` all null, but `totalSlabsCut`/`damagedSlabCount` still populated from the session);
no completed `CuttingSession` at all (`totalSlabsCut: 0`, `costPerSlab: null`, but `costBasis`
still populated from the block's own cost fields); and a multi-session block where one session
is still `in_progress` with nulls (confirmed excluded from the sum, not counted as zero).
Cleaned up all test rows afterward; confirmed local Postgres is back to exactly its prior state
(1 `Factory`, 2,421 `Expense` rows, `raw_block` empty). No production database contact.

Reviewer findings (Richard, 2026-07-11): 0 Must Fix, 0 Escalate to Architect. Traced all 4
Definition-of-Done scenarios plus the 2 extra edge cases by hand rather than trusting Bob's
smoke-test summary; confirmed the `!= null` (not truthy) check correctly treats
`actualAmountPaid: 0` as a real cost basis, and that `findFirst({ id, factoryId })` scoping is
unchanged (no cross-factory leak). One non-blocking Should Fix, logged here per Richard's own
recommendation rather than a code change: the session-summing logic
(`raw-block.service.ts:99-101`) assumes `totalSlabsCut` and `damagedSlabCount` are always
written together, which holds today because `cutting-session.service.ts`'s `complete()` is the
only writer and sets both atomically — but `CuttingSession.status` documents an unused
`aborted` value that, if ever wired up to set one field without the other, would silently
under-count loss. KNOWN GAP — revisit if/when `aborted` is implemented.
Ready for Builder: YES — 2026-07-11.

---

### Step 4 — Owner/Admin role-based dashboard — BUILT, AWAITING REVIEW
*Date: 2026-07-11*

Files changed:
- `packages/frontend/lib/useRole.ts` (new) — wraps Clerk's `useUser()`, returns the role string
  from `publicMetadata.role`, or `undefined` while `!isLoaded`. Second call site for this logic
  (`AppNav.tsx` has its own inline read, left untouched — not in scope this step per the brief).
- `packages/frontend/app/dashboard/page.tsx` (rewritten) — `Dashboard` now branches on
  `useRole()`: owner/admin render `OwnerDashboard` (5 widgets), everything else renders
  `PlaceholderDashboard` (today's unchanged placeholder markup, extracted verbatim into its own
  component).
- `packages/frontend/app/globals.css` — added `stat-row`/`stat-card`/`stat-number`/`stat-label`,
  `mini-bar-list`/`mini-bar-row`/`mini-bar-track`/`mini-bar-fill`/`mini-bar-value`,
  `session-grid`/`session-card`, `recent-columns`/`recent-col-title`, `empty-note`, and a
  `dashboard-fade-in` staggered fade-in keyframe — all built from the existing palette
  variables/fonts, no new colors or fonts introduced.
- `.claude/launch.json` — added a `backend` dev-server entry (didn't exist before, needed it to
  verify against a live API) and changed `frontend`'s port from 3000 to 3010 (an unrelated
  legacy process — a different "STONEOS CONTROL ROOM" app, not this codebase — already owns
  3000 in the dev environment; verified by curling it and reading its page text before
  concluding it wasn't this Next.js app).

Decisions made:
- Verified all 5 endpoints' actual response shapes against the backend source (service +
  schema) before writing any frontend code, per the brief's explicit instruction not to assume
  field names — full detail logged in the Builder Plan section of `handoff/ARCHITECT-BRIEF.md`.
  One correction to the brief's own illustrative text: `RawBlock.currentStatus` real values in
  this codebase are `in_stock` / `under_cutting` / `cut` (grepped every write site), not the
  brief's example "polished"/"sold" labels (those live on `Slab.salesStatus`, a different
  model) — widget 4 groups by whatever `currentStatus` values actually occur rather than
  hardcoding a status list, so it stays correct if new states are added later.
- Reused the already-extracted `Ticket` component (`components/Ticket.tsx`, used by
  `admin/users/page.tsx`) instead of hand-rolling ticket markup — keeps the dashboard visually
  identical to other pages with less duplication.
- Widget 5 (recent activity): fetched `/sales-orders` and `/expenses` unfiltered and
  sorted/sliced client-side, per the brief (neither endpoint supports the filtering this widget
  needs from the frontend's existing usage patterns).
- Micro-interactions per the brief's "light, functional" guidance: a staggered fade-in on the 5
  ticket cards on load (`dashboard-fade-in`, 40ms stagger), and a subtle lift + brass border on
  hover for `.stat-card`/`.session-card` — no decorative animation beyond that.
- `useRole()` returns `undefined` while Clerk is loading (matches the brief's literal spec) —
  this means a signed-in owner briefly sees the non-owner placeholder for one render before
  Clerk resolves, rather than a dedicated loading skeleton. Considered adding a distinct loading
  state but the brief specifies the hook's return shape exactly as built; flagging as an open
  question below rather than deviating unbriefed.

Verification:
- `npx tsc --noEmit` (frontend) — clean.
- `npm run build` (frontend) — clean, `/dashboard` compiles (3.61 kB, 149 kB First Load JS).
- Live browser check: could not complete a logged-in walkthrough — Clerk sign-in requires
  entering a password, which is a hard-prohibited action for Claude Code regardless of consent
  (credential entry into any field). Confirmed instead: (a) `/dashboard` compiles and renders
  the Clerk sign-in gate correctly when signed out (same `AuthGate` behavior as every other
  protected page — verified via browser navigation, got the real sign-in page, not an error);
  (b) wrote and ran `scratchpad/verify-dashboard-widgets.js` (not committed) — a read-only
  script against local Postgres that runs the exact same Prisma queries and client-side
  aggregation the dashboard's `load()` performs, against the real "Vedam Granites" factory.
  Results against real backfilled data: sales summary (13 days in range) → 48,559 sqft,
  ₹28,04,987 invoiced, ₹0 received (matches — `actualAmountReceived` was never backfilled with
  real figures, not a bug); expense summary (65 rows in range) → ₹36,10,990 total, top 5
  categories correctly sorted descending; active sessions and raw block stock both correctly
  empty (matches `SESSION-CHECKPOINT.md`: `raw_block` has no rows yet); recent sales orders
  correctly empty (0 `SalesOrder` rows exist — only backfilled `DailySalesSummary` rows exist,
  which is a different model); recent expenses correctly shows the 5 most recent of 2,421 rows.
  No production database contact.

Open questions for Richard:
- The `useRole()` loading-state behavior above (brief owner sees placeholder before Clerk
  resolves) — acceptable as literally specified, or worth a distinct loading state in a
  follow-up?
- `.claude/launch.json`'s frontend port change (3000 → 3010) is a local dev-environment
  workaround for an unrelated stray process already bound to 3000, not a code change — flagging
  in case the Owner's normal dev workflow expects port 3000 specifically.

#### Step 4 Round 2 — Richard's Must Fix + Should Fix
*Date: 2026-07-11*

Richard's `handoff/REVIEW-FEEDBACK.md` (Ready for Builder: NO) found 1 Must Fix, fixed in
`dashboard/page.tsx`:
- `OwnerDashboard`'s `load()` had no `try`/`catch` around the `Promise.all` of 5 `apiFetch`
  calls, and `setLoaded(true)` only ran on the success path — a single transient failure (cold
  start, near-expiry token, network blip) left the dashboard stuck on "Loading…" forever with no
  explanation. Fixed: wrapped the body of `load()` in `try`/`catch`, moved `setLoaded(true)` into
  a `finally` so it always runs (matching `admin/users/page.tsx`'s `loadUsers` pattern exactly),
  added an `errorMsg` state set in the `catch`, and added a third render branch — `!loaded` →
  "Loading…", `errorMsg` → a rust-colored "Couldn't load dashboard data: …" ticket, else → the
  real widgets — so a failure is visible and terminal rather than an infinite spinner.

Also took the Should Fix (useRole loading-state flash) since a clean, low-risk fix was available
without changing `useRole()`'s contract: `Dashboard` now also reads Clerk's own `isLoaded` via
`useUser()` and renders a new `LoadingDashboard` component (distinct from `PlaceholderDashboard`)
while `!isLoaded`, before branching on role. This closes the one-render flash of the non-owner
placeholder for a signed-in owner/admin without touching `useRole.ts`'s return contract, which
still matches the brief's literal spec (role string or `undefined` while loading).

Left `.claude/launch.json`'s port question untouched per the coordinator's instruction — that's
escalated to the Owner, not the Builder's to resolve.

Verification: `npx tsc --noEmit` and `npm run build` (frontend) both clean, `/dashboard` compiles
(3.73 kB, 150 kB First Load JS — negligible size increase from Round 1). Re-ran
`scratchpad/verify-dashboard-widgets.js` against local Postgres — identical output to Round 1
(the data/aggregation logic itself didn't change, only error handling around it), confirming the
fix didn't regress the happy path.

**Live browser confirmation of the Must Fix (beyond the read-only script):** the dev-environment
browser tab already carried an authenticated owner session from earlier work in this environment
— no credentials were entered to get it. Navigating to `/dashboard` rendered the real
`OwnerDashboard` (confirmed via the "Team" nav link, which `AppNav.tsx` only shows to
owner/admin) and displayed **"Couldn't load dashboard data: Failed to fetch"** instead of hanging
on "Loading…" — a genuine, unprompted trigger of exactly the failure mode Richard flagged.
Root cause confirmed via `read_network_requests`: all 6 `GET` calls to `localhost:4000` failed
with `net::ERR_FAILED` while their `OPTIONS` preflights returned `204` — a CORS mismatch, because
`packages/backend/src/main.ts:6` defaults `FRONTEND_URL` to `http://localhost:3000` and the
frontend is now running on 3010 (Round 1's port workaround). This is the escalated port question
manifesting, not a new bug — left untouched per instruction — but it means the Must Fix got
tested against a real failure in a real browser, not just a simulated one, and behaved exactly as
intended: terminal, visible, no infinite spinner.

### Step 5A — Recovery ratio report — BUILT, AWAITING REVIEW
*Date: 2026-07-12. Built in isolated worktree `worktrees/recovery-ratio-report`,
branch `feat/recovery-ratio-report`.*

Files changed:
- `packages/backend/src/modules/inventory/raw-block.service.ts` — new `findRecoveryRatios(factoryId)`
  method + private `computeRecoveryRatio` helper, following the `computeDamagedSlabLoss` pattern
  from Step 3.
- `packages/backend/src/modules/inventory/raw-block.controller.ts` — new `GET /raw-blocks/recovery-ratio`
  route, declared before `GET(":id")`.
- `packages/frontend/app/reports/recovery-ratio/page.tsx` (new) — read-only table page.
- `packages/frontend/components/AppNav.tsx` — added a "Recovery Ratio" nav link (unconditional,
  not role-restricted).

Decisions made:
- `soldSqft` computed by navigating `block → slabs → salesLines` (the inverse of
  `SalesLineItem.slabId`) rather than a raw `salesLineItem.findMany` scan — this makes the
  brief's "null slabId rows must not crash/contribute" requirement automatically true by
  construction (a null-slabId line item can never be any slab's inverse relation), no extra
  filtering code needed.
- Response shape flattens `soldSqft`/`recoveryRatio`/`benchmark`/`belowBenchmark` directly onto
  each returned block object (not nested under a sub-key) — matches the brief's Definition of
  Done wording exactly, a deliberate deviation from `computeDamagedSlabLoss`'s nested-object
  precedent from Step 3.
- `recoveryRatio` is `null` when `weightTons` is null/0 OR `soldSqft` is 0 (a block with nothing
  sold yet reports no ratio, not a ratio of 0) — `belowBenchmark` is `null` in lockstep.
- Frontend reuses existing `.badge` classes semantically rather than adding new CSS: `invoiced`
  (moss/green) = on-or-above benchmark, `cash` (rust/red) = below benchmark, `mixed` (brass/amber)
  = no sales yet. No new colors/fonts introduced, per the brief.
- Route path chosen: `/reports/recovery-ratio` (frontend) / `GET /raw-blocks/recovery-ratio`
  (backend) — both taken directly from the brief's own example paths since nothing in the
  existing codebase contradicts them (no pre-existing `/reports/*` convention to check against).

Verification:
- `npm install` from the worktree root (workspaces: `packages/backend`, `packages/frontend`) —
  clean, 466 packages.
- `npx prisma generate` (backend) — was required before `tsc`/`build` would pass; the fresh
  worktree's `node_modules` didn't have a generated Prisma Client yet (unrelated to this step's
  code, just a fresh-checkout prerequisite).
- `npx tsc --noEmit` — clean in both `packages/backend` and `packages/frontend`.
- `npm run build` — clean in both packages; `/reports/recovery-ratio` appears in the Next.js
  build output as a static route (1.71 kB, 148 kB First Load JS).
- No database connection attempted at any point (worktree has no reachable local Postgres in
  this context, and no production DB exists for this project) — correctness reasoned through by
  reading `schema.prisma` and the existing `computeDamagedSlabLoss`/`findOne` code instead, per
  instruction. The brief notes local Postgres's `raw_block` table is currently empty (Step 4's
  precedent) — the frontend page's empty-state path (`loaded && blocks.length === 0`) was
  written and reviewed by hand for this exact scenario, not exercised live.

Open questions for Richard: none blocking — see REVIEW-REQUEST.md for the two non-blocking notes
(route path naming, no existing empty-state CSS class) already flagged in the Builder Plan.

#### Step 5A Round 2 — Richard's review + Architect's direct fix
*Date: 2026-07-12*

Richard's review found 0 Must Fix, 0 Escalate blocking the merge (`Ready for Builder: YES`).
Independently confirmed (by reading the actual controller/service code and diff, not taking
Bob's summary on faith): route ordering (`recovery-ratio` genuinely declared before `:id`),
null-handling (`recoveryRatio`/`belowBenchmark` both `null` in lockstep exactly when expected,
`soldSqft` genuinely sums every slab/every sales line), multi-tenant scoping, and that
`computeDamagedSlabLoss`/`schema.prisma` are byte-for-byte untouched. One Should Fix (inline
empty-state styling, non-blocking) and one Escalate: the `/reports/recovery-ratio` route path
introduces a nesting convention with no precedent elsewhere in the app (every other page is
flat — `/sales`, `/expenses`, `/dpr`).

Architect's call (technical/navigation-convention decision, not a product-behavior change):
flattened to `/recovery-ratio` for consistency with every other existing page. Fixed directly
(moved `page.tsx`, deleted the stale `app/reports/` directory, updated `AppNav.tsx`'s link)
rather than a Bob round-trip for a two-line change, matching Step 4's precedent for
Architect-closed tiny gaps. Re-verified after the fix: cleared stale `.next` build cache,
re-ran `npx tsc --noEmit` (clean) and `npm run build` (clean) — `/recovery-ratio` now appears
as a flat static route (1.71 kB, 148 kB First Load JS) in the build output.

**Step 5A is CLEARED — awaiting Owner go-ahead to merge.**

---

### Step 5B — Per-slab dimension overrides — BUILT, AWAITING REVIEW
*Date: 2026-07-12 · Built in isolated worktree `feat/slab-dimension-overrides`, running in
parallel with three other independent steps in sibling worktrees (not touched, not referenced).*

Files changed:
- `packages/backend/src/modules/production/cutting-session.service.ts` — `CompleteSessionInput`
  gains an optional `slabOverrides?: { sequence; lengthFt?; widthFt?; thicknessMm? }[]` field;
  `complete()` validates each `sequence` is a unique integer in `1..finalGoodSlabCount` (400
  otherwise) before the transaction opens, then the generation loop resolves each slab's
  dimensions as `override?.field ?? input.field` (falling through to the existing `?? 18.0`
  thickness default unchanged) instead of always using the session-level input directly.
- `packages/frontend/app/dpr/page.tsx` — added a per-session "different sizes for some slabs?"
  checkbox (default off, only rendered once `finalGoodSlabCount` has a valid value) inside the
  existing Complete Cutting block; when checked, renders one `.row-card`/`.row-grid` row per
  slab sequence (reusing the same repeatable-row pattern already used in `sales/page.tsx`),
  pre-filled with the session-level defaults and independently editable, inside a scrollable
  (`maxHeight: 320, overflowY: auto`) wrapper so a 47-row batch stays usable. `submitCompletion`
  only builds/sends `slabOverrides` when the toggle is on, and only includes per-sequence entries
  (and only the specific fields) that actually differ from the session default — untouched rows
  are omitted entirely, keeping the default (toggle-off) request byte-identical to before this
  step.

Decisions made:
- Validation runs before the `$transaction` opens (same pattern as the existing
  `finalGoodSlabCount > totalSlabsCut` check), so a bad `slabOverrides` payload never partially
  applies.
- Built an `overridesBySeq` `Map` once per `complete()` call rather than `.find()`-ing inside the
  per-slab loop — O(n) instead of O(n²) for large batches, no behavior difference.
- No controller/DTO change needed — `session.controllers.ts`'s `complete()` endpoint already
  takes `body: any` and passes it straight through to the service, so the new field flows through
  untouched; validation lives entirely in the service, matching this file's existing style (no
  class-validator anywhere in this module).
- No schema/migration change, per the brief — `Slab.lengthFt`/`widthFt`/`thicknessMm` already
  exist as per-row columns.

Verification (no live DB, per this run's instructions):
- `npx tsc --noEmit` clean in both `packages/backend` and `packages/frontend` (after running
  `npx prisma generate` once, which this fresh worktree's `node_modules` needed — generation
  only, no DB connection).
- `npm run build` clean in both packages (Next.js build also passed its own type/lint pass and
  generated `/dpr` — 5.14 kB, 151 kB First Load JS).
- Traced `complete()` by hand for the default path (`slabOverrides` undefined/omitted): the `Map`
  is empty, `overridesBySeq.get(seq)` is always `undefined` for every `seq`, and each slab's
  `lengthFt`/`widthFt`/`thicknessMm` resolution collapses to exactly `input.field` / `?? 18.0` —
  identical to the pre-existing logic, confirming the backward-compatibility requirement.
- Traced a mixed-size example by hand (finalGoodSlabCount=5, one override on `sequence: 3` with
  only `lengthFt` set): seq 3 gets the overridden length plus session-default width/thickness;
  seq 1, 2, 4, 5 get pure session defaults — confirms the per-field fallback works as specified.
- Traced the validation branch by hand for `sequence: 0`, `sequence` > `finalGoodSlabCount`, and
  a duplicate `sequence` — all three throw `BadRequestException` before the transaction opens.

Open questions: none — logged in the Builder Plan section of `handoff/ARCHITECT-BRIEF.md`, brief
was unambiguous on both backend and frontend shape.

#### Step 5B Round 2 — Richard's review
*Date: 2026-07-12*

Richard's review found 0 Must Fix (`Ready for Builder: YES`). Independently hand-traced the
default (no-override) path against the actual pre-change diff (not Bob's paraphrase) and
confirmed it collapses to byte-identical behavior; confirmed validation runs entirely before the
transaction opens; confirmed all sequence-validation edge cases (0, out-of-range, non-integer,
duplicate) correctly reject with 400; confirmed the frontend toggle defaults off and the default
submission omits `slabOverrides` entirely. One non-blocking Should Fix logged (override dimension
values aren't type/range-validated — mirrors a pre-existing gap elsewhere in this file, not a new
hole). Zero Escalate items.

**Step 5B is CLEARED — merged 2026-07-12.**

---

### Step 5C — Item-level Tally detail — BUILT, AWAITING REVIEW
*Date: 2026-07-12. Worktree: `worktrees/tally-item-detail`, branch `feat/tally-item-detail`.*

Files changed:
- `packages/backend/prisma/schema.prisma` — added `TallyVoucherItem` model (id, batch relation,
  voucherType, entryDate, stockItemName, quantity `Decimal(12,2)`, amount `Decimal(14,2)`) and
  the inverse `voucherItems TallyVoucherItem[]` relation on `TallyImportBatch`.
- `packages/backend/prisma/migrations/20260712000000_tally_voucher_item/migration.sql` (new) —
  hand-written, NOT generated via `prisma migrate diff` (no reachable `DATABASE_URL` in this
  worktree — no `.env`, `localhost:5432` connection refused). Written to match
  `20260709122654_init/migration.sql`'s DDL conventions for the sibling `tally_ledger_entry`
  table exactly (column order, `DATE`/`DECIMAL(12,2)`/`DECIMAL(14,2)` types, FK with
  `ON DELETE RESTRICT ON UPDATE CASCADE`). **Needs a real `migrate diff` run to confirm once a
  DB is reachable — flagged in REVIEW-REQUEST.**
- `packages/backend/src/modules/tally/tally-import.service.ts` — `TallyParserService.parseDaybook`
  now additionally extracts `ParsedVoucherItem[]` from the same `ALLINVENTORYENTRIES.LIST` array
  structure 3 already traverses, reusing that entry's own `ACCOUNTINGALLOCATIONS.LIST` amount
  rather than re-deriving it. Added `parseTallyQuantity()` helper to strip the numeric prefix off
  Tally's `"2260 SQF"`-style quantity strings. Return type changed from `ParsedLedgerLine[]` to
  `{ lines, items }` — the *ledger line* array/loop/values are byte-for-byte unchanged, only the
  wrapper shape changed (the only caller, `importDaybook`, was updated to match; no other callers
  exist in the repo — grepped). `TallyImportService.importDaybook` now also does
  `tx.tallyVoucherItem.createMany(...)` in the same transaction and returns `itemsImported`
  alongside `entriesImported`. Added `TallyImportService.itemCrossCheck(factoryId, from, to)` —
  sums `TallyVoucherItem.quantity` for Sales-type vouchers (via `batch.factoryId`) vs.
  `SalesLineItem.quantity` for `SalesOrder`s in range (via `SalesOrder.factoryId` directly, same
  scoping style as `SalesOrderService`), returns `{ from, to, tallySqft, stoneosSqft, delta }`.
- `packages/backend/src/modules/tally/tally-import.controller.ts` — added
  `GET /tally-import/item-cross-check?from&to`, 400s if either param is missing.

Decisions made / flagged as guesses (per brief's explicit instruction to be honest about this):
- `STOCKITEMNAME`, `ACTUALQTY`, `BILLEDQTY` tag names are inferred from Tally's documented
  item-invoice-mode XML shape — **not verified** against a real export or against the existing
  code's own verified-tag comment block (which only covers
  `ALLINVENTORYENTRIES.LIST`/`ACCOUNTINGALLOCATIONS.LIST`/`LEDGERNAME`/`AMOUNT`).
  `parseTallyQuantity` prefers `ACTUALQTY`, falls back to `BILLEDQTY` — an assumption about which
  field is more reliably present; unverified.
- `itemCrossCheck`'s Sales-voucher filter uses `voucherType: { equals: "Sales", mode:
  "insensitive" }` — a guess. Real Tally installations can use custom voucher-type names (e.g.
  "Sales - Local"); this may need to become a `contains`/`startsWith` or a configurable list once
  checked against the real export.
- `SalesOrder` already carries `factoryId` directly (not only via `customer`), so the cross-check
  scopes `SalesLineItem` through `salesOrder: { factoryId, orderDate: {...} }` directly —
  simpler than the brief's suggested customer/factory relation path, same end result.
- Migration hand-written rather than tool-generated (see above) — this is a deviation from the
  brief's stated preference and should be double-checked with a real `migrate diff` before this
  merges anywhere with DB access.

Verification:
- `npm install` from worktree root — clean (466 packages).
- `npx prisma generate` — clean, `TallyVoucherItem` present in the generated client.
- `npx tsc --noEmit` — clean in both `packages/backend` and `packages/frontend`.
- `npm run build` — clean in both `packages/backend` and `packages/frontend` (frontend build has
  no source changes this step; ran it anyway to confirm nothing else in the monorepo regressed).
- **Real Tally-data verification NOT done** — no real Tally XML export file exists in this repo
  or worktree (confirmed per the brief's constraint — `prisma/validate-tally-parser.js` takes the
  file as an external CLI arg). Reasoned through the additive-only claim by inspection instead:
  the new item-extraction loop reads additional fields off the same already-traversed
  `inventoryEntries` array inside the existing `for (const msg of messages)` loop, and pushes to
  a new, separate `items` array; the existing `lines` push/loop body was not touched. This is the
  Owner's own manual step — running an extended `validate-tally-parser.js` (or a live
  `importDaybook` call) against his actual Tally export.
- No database contact of any kind — no `.env` exists, `migrate dev`/`db push`/seed scripts were
  not run, and no attempt was made to reach a local or production Postgres instance.

Open questions for Richard:
1. Is the hand-written migration SQL acceptable to merge as-is (flagged as unverified vs. tool
   output), or should this step be blocked until someone with a reachable local DB re-generates
   it via `prisma migrate diff` and diffs the two?
2. Is `voucherType: { equals: "Sales", mode: "insensitive" }` the right level of specificity for
   the cross-check filter, or should it be broadened (`contains`) given real Tally voucher-type
   names are configurable per company and unverified here?
3. `parseDaybook`'s return type changed shape (`ParsedLedgerLine[]` → `{ lines, items }`) — flagged
   in case that's considered a bigger deviation than intended by "keep this additive."

#### Step 5C Round 2 — Richard's review
*Date: 2026-07-12*

Richard's review found 0 Must Fix (`Ready for Builder: YES`). Independently re-derived rather
than trusted: (a) regenerated the hand-written migration via `npx prisma migrate diff --from-empty
--to-schema-datamodel=prisma/schema.prisma --script` with zero DB connection required — result was
byte-for-byte identical to Bob's hand-written SQL, so the migration is correct even though the
stated justification for hand-writing it (no reachable DB) wasn't quite accurate as a *reason* to
skip the tool; (b) grepped for every caller of `parseDaybook` (exactly one, `importDaybook`,
correctly updated) and read the raw diff directly — the ledger-line-producing loop has zero
changed lines, confirming the additive-only claim by inspection rather than faith. Also confirmed
multi-tenant scoping on the new endpoint and that the real-data-verification-NOT-done disclosure
is prominent, not buried. Two Should Fix items (migration justification wording;
`from`/`to` param format validation on the cross-check endpoint) and two Escalate items — the
Sales-voucher-type filter and quantity-field precedence — both genuinely unverifiable without a
real Tally export, carried forward as the Owner's own manual verification step alongside the
migration double-check.

**Step 5C is CLEARED — merged 2026-07-12.**

---

## Known Gaps
*Logged here instead of fixed. Addressed in a future step.*

- **KG-1** — Historical production data (pre-live-DB) cannot be backfilled into
  CuttingSession/PolishingSession/CuttingDayLog — source Excel has only daily aggregate
  qty/hours, no block serial or session boundaries. Going forward, production history is
  captured correctly via the existing DPR flow; the pre-go-live gap is permanent. — logged 2026-07-11
- **KG-2 — RESOLVED 2026-07-11 (no action needed).** Owner clarified: `dpr-daily/` files are
  reference-only, meant to explain how `1. VEDAM PRODUCTION.xlsx`/`4. VEDAM YEALY DATA.xlsx`
  were compiled — they don't cover every day (only 81 of ~514), while the production/yearly
  files record every day's DPR data already. So DPR is validation, not a backfill source.
  Cross-checked the DPR "staff payment" row against the already-written `staff_salary`
  Expense rows for all 16 dates where DPR reports a nonzero figure: **15/16 match exactly**,
  confirming the PAYMENTS-column backfill is correct — no daily-granularity gap exists.
  One genuine anomaly found: **2026-04-20**, DPR reports ₹550,000 staff payment, but that
  date's PAYMENTS cell in the source ledger is blank — the amount (550000) and its note
  ("50k sandeep, 5lac wppf") are shifted one column over from every other row's layout (a
  manual data-entry slip in the source spreadsheet, not a parser bug). Owner confirmed the
  breakdown: ₹50,000 to staff member Sandeep (genuinely `staff_salary`), ₹500,000 "WPPF" =
  working-partner profit payment — a profit distribution to a partner, not a business
  expense, and not represented by any existing `EXPENSE_CATEGORIES` entry.
  **Fix implemented 2026-07-11 (code only, not yet written to any database):** added a
  narrowly-scoped, clearly-commented one-off exception in `parseProductionLedger` —
  guarded on `sheetName === "26-27" && dateCell === 46132` (the exact Excel serial for
  2026-04-20, verified by raw cell inspection) — that adds a single `staff_salary` hit of
  ₹50,000 with `toWhom: "Sandeep"` for that date only. Deliberately not a general
  shifted-column detector, per Owner's explicit instruction. The ₹500,000 WPPF amount is
  intentionally not recorded anywhere. Re-ran `--dry-run`: total mapped expense increased
  by exactly ₹50,000 (₹105,220,193 → ₹105,270,193), `staff_salary` by exactly ₹50,000
  (₹4,556,472 → ₹4,606,472), 2026-04's month total by exactly ₹50,000 — every other
  category and month unchanged, confirming the fix is fully isolated. **Applied to local
  Postgres 2026-07-11** — Docker/Postgres had gone down between the dry-run and this step
  (unrelated environment interruption; verified existing data survived the restart intact),
  then `--confirm` was re-run after fresh Owner sign-off. Verified directly against the DB:
  2,421 Expense rows (was 2,420), `staff_salary` sum ₹4,606,472, the 2026-04-20 row present
  with amount 50000 and toWhom "Sandeep", every other category total unchanged. Production
  database remains untouched.
- **KG-3 — RESOLVED 2026-07-11** — The production ledger's "OFFICIAL" column contains large
  lump-sum loan/bill payments identified by free-text description ("LOAN KIST", "LOAN INT",
  "BILL..."). Owner decided: reclassify these to `loan_payment` using a text-keyword match
  on the description (`/(?<![A-Za-z])(LOAN|KIST|BILL|EMI|INT)(?![A-Za-z])/i`, whole-token,
  handles the no-space-before-keyword pattern common in this data, excludes false positives
  like "PRINTER REPAIR"). Result: 79 entries / ₹31,798,091 → `loan_payment`; `official` now
  ₹1,337,567 (52 entries). Also resolved in the same pass: the previously-unmapped
  "PAYMENTS" column (₹4,556,472) → `staff_salary`, TO WHOM still → `Expense.toWhom`.
  Re-ran `--dry-run`, exit 0, no writes. Both changes tightened the yearly-data reconciliation
  (deltas from ₹4k-₹700k/month down to ₹500-₹5,900/month) and the dpr-daily match rate
  (27/45 → 40/45) — strong independent confirmation both reclassifications are correct.
- **KG-4** — Richard's remaining Should Fix items from the 2026-07-11 review, deferred (not
  blocking, per coordinator instruction): (a) the `--confirm` destructive-delete path
  (`prisma.expense.deleteMany`) should print the resolved DB target (e.g. `DATABASE_URL`
  host, redacted) immediately before deleting, as a last visual sanity check — this is the
  first script in the repo with a destructive write, unlike `bootstrap.ts`/`seed-machines.ts`;
  (b) no guard against the same calendar date being parsed from two different blocks/sheets —
  `dailySalesSummary.upsert` would silently overwrite (last wins) and `expense.create` has no
  unique constraint to catch a resulting duplicate insert; worth a dry-run warning if this
  ever occurs; (c) `resolveVehicleName`'s third branch (bare `"EV"` substring match) is a
  broader match than the first two branches and could misattribute an unrelated header
  instead of falling into the logged-unmapped bucket — the first two branches already cover
  every header seen in this run (0 unmapped), so tightening/removing the third is safe but
  untested; (d) `parseDprDailyDir`'s `range: "A1:C40"` silently returns `{totalSale:0,
  totalExp:0}` if a DPR file's Total/Total Exp. labels fall outside rows 1-40, indistinguishable
  from a genuine zero in the match/mismatch count — low severity since it's cross-check only,
  but worth a distinct "labels not found" flag. — logged 2026-07-11
- **KG-5 — fiscal year range RESOLVED 2026-07-11 (corrected), mismatch cause still open.**
  Initial finding (daybook.xml only = FY25-26) was incomplete — Owner correctly flagged the
  monthly/daily summary reports (`salesregister.xml`/`purchaseregister.xml`/`salee.xml`) as
  actually spanning **1 April 2022 → 1 April 2026**, verified two independent ways: (1) each
  file has 4 full April-March cycles + 1 trailing April/1-Apr (49 month-entries /
  365+366+365+365+1 day-entries); (2) the 366-day cycle lands exactly on Feb 2024 (a real
  leap year), which only lines up if cycle 1=FY22-23, cycle 2=FY23-24, cycle 3=FY24-25,
  cycle 4=FY25-26. Only cycle 4 (FY 2025-26) has any nonzero figures — FY22-23/23-24/24-25
  are entirely blank in these reports, consistent with `daybook.xml`/`Master.xml` both being
  tagged `SVCURRENTCOMPANY: VEDAM GRANITES 2025-26` (Tally adoption appears to have started
  fresh with FY25-26; earlier years are empty template rows, not missing/hidden data).
  **Still open:** the large deltas against the ledger (e.g. Feb 2026: ledger ₹3.5M vs Tally
  Sales Accounts Cr ₹1.6M) persist even with the year confirmed right, so the gap is a
  definitional mismatch, not a period mismatch — Tally's "Sales Accounts" ledger group likely
  doesn't capture the same thing as the production ledger's "SALE" column (candidates:
  informal/cash sales never routed through Tally, GST-exclusive vs inclusive figures, or a
  different revenue-recognition point). Not investigated further — reconciliation-only,
  doesn't affect what was written to Expense/DailySalesSummary. Worth a follow-up if the
  Owner wants Tally trusted as a cross-check going forward.
- **KG-6** — Only one vehicle, "Nexon EV", exists in the backfilled local data (175
  vehicle-category Expense rows, all linked to it); "Van (Isuzu)" was never created. Every
  vehicle-column header the script read across all 4 fiscal years' top headers (row 0-1 of
  each block) resolved to a name containing "NEXON" or bare "EV" — the "VAN"/"ISIZU" text
  only ever appeared in a stale, non-authoritative duplicate header repeated below some
  sheets' monthly TOTAL rows (see `handoff/REVIEW-REQUEST.md` open question 3), which the
  script deliberately ignores. Net effect: **all vehicle expenses from Oct 2023 onward,
  including the earliest months, are attributed to "Nexon EV" in the database** — if the
  business actually had a different vehicle (e.g. an Isuzu van) before acquiring the Nexon
  EV, those historical rows are now mis-attributed and would need a targeted `UPDATE` (or a
  new Vehicle row + re-pointing specific date-range rows) rather than a re-run of this
  script. Needs Owner input on the actual fleet timeline to resolve. — logged 2026-07-11
- **KG-7 (Step 2)** — Richard's remaining Should Fix items from the Round 2 review, deferred
  per the coordinator's instruction (not blocking, not fixed this round):
  (a) no minimum-data validation for `opening_balance` — nothing requires `weightTons` (or any
  financial figure) actually be supplied, so a block can be created with `costStatus:
  "estimated"` and a null `weightTons`, defeating the point of tracking a real-vs-approximate
  number; consider requiring `weightTons` for `opening_balance` in a future pass;
  (b) finished_stock creates N `Slab` rows one at a time via `Promise.all(...create())` rather
  than `createMany` — pure efficiency nit, not a correctness bug (individual creates are needed
  for the per-slab ids used by `PolishingSessionSlab` linking, so not a trivial swap).
  The "transfer_in not carrying forward source block's cost figures" item from Round 1's
  review is now moot — `transfer_in` is disabled entirely per the Project Owner's direct
  decision (see Step 2 Round 2 above). — logged 2026-07-11

---

## Architecture Decisions
*Locked decisions that cannot be changed without breaking the system.*

- [Decision — date]
