# Build Log
*Owned by Architect. Updated by Builder after each step.*

---

## Current Status

**Active step:** none — Step 3 cleared, committed (`7057281`), nothing mid-flight.
**Last cleared:** Step 3 — Richard's review found 0 Must Fix, 1 non-blocking Should Fix (logged
in the Step 3 entry below, no code change needed) — Ready for Builder: YES — 2026-07-11.
Committed to `main` locally same day. Step 2 was already committed earlier this session
(`ab63693`) — also code-complete and reviewed clean (Richard's Round 2 re-review confirmed all
3 Must Fix bugs genuinely fixed and `transfer_in` fully removed).
**Pending deploy:** Step 1: production run OUT OF SCOPE for the team — Owner will run the
historical backfill against any real environment himself, manually (2026-07-11 decision). Steps
2 and 3 are committed to local `main` only — `main` is 7 commits ahead of `origin/main`, nothing
pushed. No production environment exists for this project (2026-07-11 decision: the old AWS
deployment, stoneos-db/ECS/ALB, is out of scope entirely — treat this as a fresh project with no
existing production).

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
