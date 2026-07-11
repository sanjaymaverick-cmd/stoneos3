# Architect Brief
*Written by Architect. Read by Builder and Reviewer.*
*Overwrite this file each step — it is not a log, it is the current active brief.*

---

## Step 3 — Cost allocation for damaged slabs

Read-only computed value. No new tables, no new writes, no schema migration.

### What
Add a `damagedSlabLoss` object to the response of `GET /raw-blocks/:id`
(`RawBlockService.findOne`, `packages/backend/src/modules/inventory/raw-block.service.ts`).
Values a block's damaged-slab loss at raw block purchase cost, per the existing schema
comment on `CuttingSession.damagedSlabCount` (schema.prisma:147-151) — never finished slab
price, since damage happens before polishing/finishing adds value.

### Decisions (Owner-confirmed)
- Cost basis = purchase price only: `actualAmountPaid ?? invoicedAmount ?? null`. Do NOT add
  `ExpenseAllocation` amounts (transport/royalty) into this figure — Owner explicitly chose
  purchase-price-only over purchase+allocated-expenses, for simplicity/availability.
- Per-slab cost = totalCost / totalSlabsCut, where totalSlabsCut is the PHYSICAL count
  (good + damaged) from `CuttingSession`, not `finalGoodSlabCount`.
- Loss amount = costPerSlab × damagedSlabCount.

### Build
1. In `RawBlockService.findOne`, add `cuttingSessions: true` to the existing `include`
   (alongside `transitions`, `slabs`).
2. Compute, summing across all of that block's `cuttingSessions` (normally one, but don't
   assume — sum `totalSlabsCut` and `damagedSlabCount` across every session where
   `totalSlabsCut` is not null):
   - `costBasis`: `"actual_amount_paid"` | `"invoiced_amount"` | `null` (which field was used)
   - `totalCost`: number | null
   - `totalSlabsCut`: number (0 if no session has reported yet)
   - `damagedSlabCount`: number (0 if none)
   - `costPerSlab`: number | null (null if `totalCost` is null OR `totalSlabsCut` is 0)
   - `lossAmount`: number | null (null if `costPerSlab` is null; 0 if `damagedSlabCount` is 0)
3. Attach as `damagedSlabLoss` on the object returned by `findOne` — merge into the Prisma
   result, don't persist it.
4. Scope: `findOne` only. Do NOT add this to `findAll` (list endpoint) — would be N+1 across
   every block in the list; out of scope for this step, log as a Known Gap if wanted later.
5. No controller changes needed — same endpoint, just a richer response. No new roles/guards
   — matches existing `findOne` access (any authenticated factory member).

### Flags
- Don't touch `ExpenseAllocation` at all this step — it's unrelated to this cost basis by
  Owner's decision above, even though it exists and does related-sounding work.
- Don't build a damaged-slab report/list across blocks — this step is per-block only, on the
  existing detail endpoint.
- Don't change how `CuttingSession.damagedSlabCount` is entered/validated — that's existing,
  working behavior. This step only reads it.
- Decimal math: `RawBlock.actualAmountPaid`/`invoicedAmount` are Prisma `Decimal`. Convert
  explicitly (`.toNumber()` or keep as Decimal through the division) rather than relying on
  implicit coercion — match whatever pattern the rest of this service/module already uses for
  Decimal fields (check `expense.service.ts` / `daily-sales-summary` for precedent).

### Definition of Done
- [ ] `GET /raw-blocks/:id` returns `damagedSlabLoss` with the 6 fields above
- [ ] Correct on a block with zero damaged slabs (`lossAmount: 0`)
- [ ] Correct on a block with no cost recorded yet (`costBasis: null`, `costPerSlab: null`,
      `lossAmount: null`)
- [ ] Correct on a block with no completed `CuttingSession` yet (`totalSlabsCut: 0`,
      `costPerSlab: null`)
- [ ] `findAll` (list endpoint) unchanged
- [ ] `handoff/REVIEW-REQUEST.md` written, listing the files touched

---

## Builder Plan
*Builder adds their plan here before building. Architect reviews and approves.*
