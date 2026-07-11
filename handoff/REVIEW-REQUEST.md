# Review Request — Step 3

*Written by Builder. Read by Reviewer.*

Ready for Review: YES

---

## What This Step Does

Adds a read-only computed `damagedSlabLoss` object to the response of `GET /raw-blocks/:id`,
valuing a block's damaged-slab loss at raw block purchase cost (never finished slab price),
per the schema comment on `CuttingSession.damagedSlabCount` (`schema.prisma:147-151`). No new
tables, no schema migration, no persisted writes — purely computed at read time.

## Files Changed

| File | Lines | Change |
|---|---|---|
| `packages/backend/src/modules/inventory/raw-block.service.ts` | `findOne` (was line 67-72, now ~67-79) + new private `computeDamagedSlabLoss` helper (~81-110) | `findOne` is now `async`, adds `cuttingSessions: true` to its `include`, and attaches `damagedSlabLoss` computed by the new helper onto the returned block object before returning it. |

No controller changes (`raw-block.controller.ts`'s `findOne` already just passes through).
No schema/migration changes. `findAll` untouched.

## What and Why (one sentence each)

- `findOne` includes `cuttingSessions` now — needed to read `totalSlabsCut`/`damagedSlabCount`
  per session, since a block can have more than one session.
- `computeDamagedSlabLoss` picks `actualAmountPaid` over `invoicedAmount` (fallback) as cost
  basis, per Owner's explicit purchase-price-only decision in the brief (no
  `ExpenseAllocation`, untouched).
- Sums `totalSlabsCut`/`damagedSlabCount` across every session where `totalSlabsCut` is not
  null — excludes an `in_progress` session that hasn't reported a physical count yet, rather
  than treating its nulls as zero (which would silently understate `totalSlabsCut`).
- `costPerSlab` = `totalCost / totalSlabsCut`, null-safe on both null `totalCost` and
  zero `totalSlabsCut` (division-by-zero guard).
- `lossAmount` = `costPerSlab * damagedSlabCount`; null only when `costPerSlab` is null, so a
  genuine zero-damage block reports `lossAmount: 0`, not null — this distinction is the one
  place a careless implementation would get it wrong.
- Decimal→number conversion uses `Number(x)`, matching the existing pattern in
  `expense.service.ts`/`daily-sales-summary.service.ts` (no `.toNumber()` precedent exists
  anywhere else in the codebase, so this was the closer match to "whatever pattern the rest of
  this service/module already uses" per the brief's flag).
- Preserved `findOne`'s existing behavior of returning `null` unchanged (no new
  `NotFoundException`) when no block matches — added an explicit early return before running
  the computation, rather than changing not-found semantics as a side effect.

## Verification

`tsc --noEmit` clean. `npm run build` clean (no output, no errors).

Wrote and ran a throwaway smoke-test script (`scratchpad/smoke-test-damaged-slab-loss.js`, not
committed) against local Postgres, in a disposable factory + machine, covering all 4 Definition
of Done scenarios plus two extra edge cases:

1. Normal block, `actualAmountPaid` present, 3 damaged of 20 total slabs cut →
   `costBasis: "actual_amount_paid"`, `costPerSlab: 5000`, `lossAmount: 15000`. Also confirms
   `actualAmountPaid` is preferred over `invoicedAmount` when both are present.
2. Zero damaged slabs → `lossAmount: 0` (not null), `costPerSlab` still correctly computed.
3. No cost recorded (`actualAmountPaid`/`invoicedAmount` both null) → `costBasis: null`,
   `costPerSlab: null`, `lossAmount: null`, while `totalSlabsCut`/`damagedSlabCount` are still
   correctly populated from the session (they don't depend on cost).
4. No completed `CuttingSession` at all → `totalSlabsCut: 0`, `costPerSlab: null`,
   `lossAmount: null`, while `costBasis` is still populated from the block's own cost fields
   (it doesn't depend on sessions).
5. (Extra) Only `invoicedAmount` present, `actualAmountPaid` null → `costBasis` correctly
   falls back to `"invoiced_amount"`.
6. (Extra) Block with 3 `CuttingSession` rows: two completed (`totalSlabsCut` 10 and 5) and one
   `in_progress` with `totalSlabsCut`/`damagedSlabCount` both null → sums only the two
   completed sessions (`totalSlabsCut: 15`, `damagedSlabCount: 2`), confirming the in-progress
   session is excluded rather than counted as zero.

**24/24 checks passed.** Cleaned up all test rows afterward; confirmed local Postgres is back
to exactly its prior state (1 `Factory`, 2,421 `Expense` rows, `raw_block` empty — same as after
Step 2). No production database contact at any point.

## Open Questions / Uncertainties

None outstanding for this step. All judgment calls (cost basis preference, multi-session
summing, null-propagation rules) were explicit in the brief; verified against the real schema
(`schema.prisma:130-151, 254-298`) and the existing Decimal-handling precedent before writing
any code.

## Definition of Done — Self-Check

- [x] `GET /raw-blocks/:id` returns `damagedSlabLoss` with the 6 fields
- [x] Correct on a block with zero damaged slabs (`lossAmount: 0`)
- [x] Correct on a block with no cost recorded yet (`costBasis: null`, `costPerSlab: null`,
      `lossAmount: null`)
- [x] Correct on a block with no completed `CuttingSession` yet (`totalSlabsCut: 0`,
      `costPerSlab: null`)
- [x] `findAll` (list endpoint) unchanged — not touched
- [x] `handoff/REVIEW-REQUEST.md` written (this file)
