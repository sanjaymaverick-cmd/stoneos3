# Review Feedback — Step 3
*Written by Reviewer. Read by Builder and Architect.*

Date: 2026-07-11
Ready for Builder: YES

---

## Must Fix
*None.*

## Should Fix

- `raw-block.service.ts:99-101` — `reportedSessions` is filtered on `totalSlabsCut != null`,
  and `damagedSlabCount` is then read with `?? 0` inside the same filtered set. This assumes
  `totalSlabsCut` and `damagedSlabCount` are always written together. Today that assumption
  holds — `cutting-session.service.ts:141-152`'s `complete()` is the only code path that ever
  sets either field, and it always sets `status: "completed"`, `totalSlabsCut`,
  `finalGoodSlabCount`, and `damagedSlabCount` atomically in one `update()` inside a
  transaction, so the two fields can never be out of sync in the current codebase. But the
  schema comment for `CuttingSession.status` (`schema.prisma:139`) documents a third value,
  `aborted`, that no code path sets yet. If an `aborted` (or any future) state is ever
  introduced that writes `totalSlabsCut` without `damagedSlabCount`, this would silently
  under-count loss (treating a real null as 0) rather than excluding the session the way the
  `in_progress` case is deliberately excluded. Not a bug against today's data or the Definition
  of Done — no fix required now — but worth a one-line comment noting the assumption, or a
  `BUILD-LOG.md` entry, so it isn't rediscovered the hard way when `aborted` gets wired up.

## Escalate to Architect
*None.*

## Cleared

Reviewed `raw-block.service.ts:67-107` (the only file/lines Bob listed) against the schema
comment cited in the brief (`schema.prisma:130-151` for `CuttingSession`, `:254-298` for
`RawBlock`), and traced all 4 Definition-of-Done scenarios plus the two extra edge cases by
hand rather than taking the smoke-test summary on faith:

1. **6 fields present** — `costBasis`, `totalCost`, `totalSlabsCut`, `damagedSlabCount`,
   `costPerSlab`, `lossAmount` are all returned unconditionally from `computeDamagedSlabLoss`.
2. **Zero-damage block → `lossAmount: 0`, not null** — confirmed by hand: when
   `damagedSlabCount` sums to `0` but `costPerSlab` is non-null, `lossAmount = costPerSlab * 0
   = 0`, and the null-guard on `lossAmount` is keyed off `costPerSlab`, not `damagedSlabCount`
   — the one place a careless implementation gets this wrong, correctly handled here.
3. **No cost recorded → all three cost fields null** — `costBasis` falls through both
   `!= null` checks to `null`; `totalCost` inherits `null` from `costBasis === null`;
   `costPerSlab`'s guard (`totalCost != null && totalSlabsCut > 0`) short-circuits on the
   first clause. `totalSlabsCut`/`damagedSlabCount` are correctly independent of cost and
   still populate from sessions.
4. **No completed session → `totalSlabsCut: 0`, `costPerSlab: null`** — empty
   `cuttingSessions` (or all-null-`totalSlabsCut`) produces an empty `reportedSessions`,
   `reduce` over `[]` correctly yields `0` (not `NaN`/undefined), and the `totalSlabsCut > 0`
   guard correctly forces `costPerSlab` to `null` rather than dividing by zero.
5. **`actualAmountPaid` preferred over `invoicedAmount`** — ternary checks
   `actualAmountPaid != null` first; confirmed this is a `!= null` check (not truthy), so a
   genuine `actualAmountPaid: 0` (block received free) is correctly treated as a present cost
   basis rather than falling through to `invoicedAmount`.
6. **Multi-session summing excludes in-progress** — `reportedSessions` filter on
   `totalSlabsCut != null` correctly drops an `in_progress` session with null counts while
   summing two `completed` sessions; verified this is currently equivalent to filtering on
   `status === "completed"` given point above (see Should Fix).

**Multi-tenancy**: `findOne`'s `findFirst({ where: { id, factoryId } })` is unchanged and still
scopes correctly; the new `cuttingSessions: true` include adds no additional query and no
cross-factory read (`CuttingSession.factoryId` isn't referenced or leaked — only
`totalSlabsCut`/`damagedSlabCount` are read). No conflict with the no-cross-factory-access
rule.

**`Number(x)` precedent claim verified** — repo-wide check confirms `daily-sales-summary.service.ts:38-40`
and `expense.service.ts:67` are the only other Decimal→number conversions in the backend, both
using plain `Number(x)`, no `.toNumber()` anywhere. Bob's claim that this is "the closer match"
is accurate, not just asserted.

**`async findOne` change is safe** — the only caller (`raw-block.controller.ts:19-20`) does a
bare `return this.service.findOne(...)`; Nest awaits controller return values regardless of
whether they're a plain value or a `Promise`, so making the method `async` is transparent to
the controller. Confirmed no other internal call site in the service calls `this.findOne`
(grepped the file) that could be affected by the shape change (extra `cuttingSessions`/
`damagedSlabLoss` keys on the returned object).

**`findAll` untouched** — confirmed, no diff.

Step 3 is clear.

---

# Step 2 (Round 2)
*Preserved below for the full trail.*

---

## Must Fix
*None.*

## Should Fix
*None new. Prior open items (missing `opening_balance` minimum-data validation, `createMany`
vs `Promise.all` for finished_stock slabs) remain correctly logged in `handoff/BUILD-LOG.md`
as deferred follow-ups, not re-raised here.*

## Escalate to Architect
*None. Round 1's escalation was resolved directly by the Project Owner (verbatim decision
recorded in `handoff/ARCHITECT-BRIEF.md`); verified below that the resolution was actually
implemented, not just asserted.*

## Cleared

Re-verified all 3 Round 1 Must Fix bugs directly against the current
`raw-block.service.ts`/`raw-block.controller.ts` (diffed against `HEAD`, not just taking the
review request's word for it):

1. **`entrySource` allowlist** (`:13,48,76-80`) — `ENTRY_SOURCES = ["purchase",
   "opening_balance"] as const` is checked immediately on entry to `create()`, before any
   role/branch logic, throwing `BadRequestException` on anything else (including the literal
   string `"transfer_in"`). Same pattern as `RECONCILE_FIELDS`, as prescribed.
2. **`validateMachineType` factory scoping** (`:258-266`) — now takes `factoryId` as a
   parameter and calls `this.prisma.machine.findFirst({ where: { id: machineId, factoryId } })`.
   Confirmed this matches `machine.service.ts`'s own scoping pattern
   (`findMany({ where: { factoryId } })`) — same shape, not a look-alike. Both call sites
   (`:97`, `:113-114`) pass the correct `factoryId`.
3. **`reconcile()` cost_status graduation rule** (`:315-316`) — now reads
   `block.costStatus !== "estimated" ? block.costStatus : (fieldName === "weightTons" ?
   "estimated" : "confirmed")`. Traced the logic by hand: a block whose `costStatus` is
   anything other than `"estimated"` (e.g. an ordinary `"pending"` purchase block awaiting
   its invoice) now always keeps its existing status untouched, regardless of which field is
   reconciled — the original bug (unconditional promotion to `"confirmed"`) is gone. The
   `"estimated"` branch's own behavior (weight alone stays `"estimated"`; invoiced/actual
   amount graduates to `"confirmed"`) is unchanged from what Round 1 already cleared.

**`transfer_in` removal — verified complete, not just claimed:**
- Repo-wide grep (`packages/`) for `transfer_in`, `transferIn`, `validateTransferIn`,
  `sourceFactoryId`, `transferredFromBlockId`, `transferredToBlocks`, `blockTransfersOut`
  returns matches in exactly two files: `raw-block.service.ts` (two hits, both comments
  documenting the Project Owner's decision — no executable reference) and `schema.prisma`
  (the fields/relations themselves, left in place deliberately per the brief — not flagged).
  No frontend, DTO, or other service file references any of these names.
- `validateTransferIn` method is gone entirely (not present, not commented out).
- `CreateRawBlockInput` no longer declares `sourceFactoryId`/`transferredFromBlockId`; the
  `tx.rawBlock.create()` data object doesn't reference either field.
- No remaining code path in `raw-block.service.ts` queries a `Factory` or `RawBlock` row
  outside the caller's own `factoryId` — every Prisma call in the file is scoped.
- `npx tsc --noEmit` on `packages/backend` run directly (not just taking the build claim on
  faith): clean, no errors.
- Cross-checked `handoff/BUILD-LOG.md`: the deferred Should-Fix items (opening_balance
  minimum-data validation, `createMany` nit) are logged there as claimed, not silently dropped.

No leftover dead code, unused imports, or partial-removal artifacts found. Round 1's other
"Cleared" findings (schema/migration correctness, role-gating mechanics, mid_cutting/
finished_stock FK wiring) are untouched by this round's diff and still stand.

Step 2 is clear.

---

# Round 1 (original)
*Preserved below for the full trail.*

---

## Must Fix
*Blocks the step. Builder fixes before anything moves forward.*

- `packages/backend/src/modules/inventory/raw-block.service.ts:68-74` (and the `EntrySource`
  type at `:5`) — `entrySource` is read from the request body and used directly with no
  runtime check that it's actually `"purchase"` / `"opening_balance"` / `"transfer_in"`.
  `raw_block.entry_source` is a plain `TEXT` column (not a Postgres enum, unlike `UserRole`/
  `PaymentType`), so any elevated-role caller passing e.g. `entrySource: "backdoor"` sails
  past the role check (it only requires `entrySource !== "purchase"`), skips both the
  `opening_balance` and `transfer_in` validation branches entirely (neither `if` matches),
  and lands on `costStatus: "confirmed"` / `currentStatus: "in_stock"` by falling through
  the ternaries' final `else`. This persists junk into a column other code (reporting,
  reconciliation) will assume is one of three known values. Fix: validate `entrySource`
  against a fixed allowlist up front, same pattern already used for `RECONCILE_FIELDS` in
  `reconcile()`, and throw `BadRequestException` otherwise.

- `packages/backend/src/modules/inventory/raw-block.service.ts:278-286`, called from `:87` and
  `:103-104` — `validateMachineType` looks up the machine with
  `this.prisma.machine.findUnique({ where: { id: machineId } })` — **no `factoryId` filter at
  all**. This is the only unscoped `Machine` lookup in the codebase; `machine.service.ts:18`
  (the established pattern) always scopes by `factoryId`. Unlike `transfer_in` (which is
  cross-factory by design), an `opening_balance` intake has no legitimate reason to reference
  another factory's machine. As written, a caller can pass a `cuttingMachineId`/
  `polishingMachineId` belonging to a *different* factory and it validates successfully as
  long as `machineType` matches — creating a `CuttingSession`/`PolishingSession` row for this
  factory's new block that points at another factory's physical machine. This is exactly the
  kind of gap README.md's "Multi-tenant enforcement" section warns against ("every service
  method filters on [factoryId]... if you add [an unscoped query], you've broken tenant
  isolation"). Fix: pass `factoryId` into `validateMachineType` and use
  `findFirst({ where: { id: machineId, factoryId } })`.

- `packages/backend/src/modules/inventory/raw-block.service.ts:317-354`, specifically `:331`
  and `:348` — the cost_status graduation rule only special-cases blocks that are *already*
  `costStatus === "estimated"`. For any block that is not currently `"estimated"` — e.g. an
  ordinary purchase block still sitting at `"pending"` because no invoice has been entered
  yet — correcting *any* of the three reconcilable fields unconditionally forces
  `costStatus` to `"confirmed"` (line 348: `stillEstimated` is `false` whenever
  `block.costStatus !== "estimated"`, and the ternary's only other branch is `"confirmed"`).
  Example: calling `reconcile(blockId, "weightTons", 5.2)` on a still-`pending` purchase block
  flips it straight to `"confirmed"` even though `invoicedAmount` may still be null — the exact
  state `"confirmed"` is supposed to mean it *isn't*. Per the brief, this endpoint exists for
  "correcting estimated figures" — it should leave `costStatus` alone for blocks that aren't
  already `estimated`, not force them to `confirmed`. Fix along the lines of:
  `costStatus: block.costStatus !== "estimated" ? block.costStatus : (fieldName === "weightTons" ? "estimated" : "confirmed")`.

## Should Fix
*Does not block. Fix inline if under 5 minutes, otherwise log to BUILD-LOG.*

- `raw-block.service.ts:80-105` — no minimum-data validation for `opening_balance`/
  `transfer_in`: nothing requires `weightTons` (or any financial figure) actually be supplied.
  A block can be created with `costStatus: "estimated"` (or `"confirmed"` for transfer_in) and
  a null `weightTons`/`invoicedAmount`, defeating the point of tracking a real-vs-approximate
  number. Consider requiring `weightTons` for `opening_balance`.
- `raw-block.service.ts:260-274` (`validateTransferIn`) fetches the source block but never
  copies its `weightTons`/`invoicedAmount` onto the new block, yet `:114` hardcodes
  `costStatus: "confirmed"` for every `transfer_in` regardless of whether the caller actually
  supplied real numbers in the request body. Worth confirming intent — should the source
  block's own values be carried forward automatically?
- `raw-block.service.ts:22` (`StartingState`) — like `entrySource`, `input.startingState` isn't
  validated against its 3-value union either; an unrecognized value silently behaves as
  `raw_yard`. Lower severity than the `entrySource` gap (same class of issue) since nothing
  bad happens beyond silent mis-defaulting.
- `raw-block.service.ts:221-240` — finished_stock creates N `Slab` rows one at a time via
  `Promise.all(...create())` rather than `createMany`; pure efficiency nit, not a correctness
  bug (needed the individual ids for `PolishingSessionSlab` linking, so not a trivial swap).
- `raw-block.service.ts:252-276` — no check preventing `sourceFactoryId === factoryId` (a
  transfer targeting one's own factory). Harmless today, just confusing; a one-line guard
  would close it off.

## Escalate to Architect
*Product or business decision required.*

- `raw-block.service.ts:252-276` (`validateTransferIn`) — its `Factory`/`RawBlock` lookups are,
  by design, unscoped by the caller's `factoryId`, because the whole point of `transfer_in` is
  to reference a *different* factory. But README.md's stated tenant-isolation invariant is
  literally "every service method filters on `factoryId`... if you add [an unscoped query],
  you've broken tenant isolation," and there is no `Company`/`Organization` model above
  `Factory` constraining which factories are legitimate transfer partners for a given caller.
  Today, with a single pilot customer and one `Factory` row, this is moot. But as written, any
  authenticated user at any factory can probe for the existence of any other factory or
  raw_block row in the deployment (the 404-vs-400 responses are distinguishable) and, given a
  correct id, complete a cross-factory transfer against it — nothing establishes the two
  factories are actually related. This isn't a fixable code bug at this step (it's inherent to
  what the feature does), but it does directly conflict with the codebase's own documented
  enforcement model and deserves an explicit call: is unrestricted factory-to-factory transfer
  the intended long-term model once this deployment might host more than one customer, or does
  transfer eligibility need a grouping concept before then? Not resolving this myself — it's a
  product decision, not a code-level one.

## Cleared

Schema/migration: the new `RawBlock`/`CuttingSession`/`PolishingSession`/`Slab` fields, the
`BlockReconciliation` model, and all new relations are well-formed; `migration.sql` matches the
schema exactly (column types, defaults, and FK `ON DELETE` actions all consistent with the
project's existing `RESTRICT`/`SET NULL` conventions — checked against
`block_state_transition_raw_block_id_fkey` in the `init` migration); the backfill `UPDATE`'s
`WHERE invoiced_amount IS NOT NULL` scoping is correct and intentionally applies across all
factories, not per-tenant. Role-gating mechanics are sound: `create()`'s manual
body-conditional check and `reconcile()`'s declarative `@Roles()` + class-level `RolesGuard`
(guard ordering, and `RolesGuard` correctly no-op'ing when no `@Roles()` metadata is present on
a handler) both work as intended — no bypass path found in either. The
`mid_cutting`/`finished_stock` FK wiring (`CuttingSession` → `Slab`, `PolishingSession` →
`PolishingSessionSlab` → `Slab`) is internally consistent: counts, required fields, and
statuses line up with each other and with the brief's corrected field names
(`cuttingMachineId`/`polishingMachineId`, `totalSlabsCut`/`finalGoodSlabCount`/
`damagedSlabCount`, required `operationalDate`/`finishType`).
