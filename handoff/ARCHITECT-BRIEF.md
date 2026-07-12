# Architect Brief
*Written by Architect. Read by Builder and Reviewer.*
*Overwrite this file each step — it is not a log, it is the current active brief.*

---

## Step 5C — Item-level Tally detail (README #6)

You are working in an isolated git worktree on branch `feat/tally-item-detail`. This is running
in parallel with three other independent steps (each in their own worktree) — do not assume
anything about their state, do not touch files outside what this brief describes.

### What this is
`packages/backend/src/modules/tally/tally-import.service.ts`'s `parseDaybook()` currently
extracts only ledger-account-level detail (debit/credit/account/narration per voucher) and
explicitly does NOT parse item/stock-item level detail — see the comment at ~line 53-57:
"Deliberately NOT parsing item/stock-item level detail (e.g. 'POLISHED GRANITE SLABS, 2260
SQF')... Worth a future enhancement (e.g. cross-checking sqft sold against StoneOS's own
sales_line_item)." This step is that enhancement.

**Important constraint you cannot work around:** the real Tally XML export files are business
data and are NOT in this repo (confirmed — `prisma/validate-tally-parser.js`'s docstring shows
they're passed as external CLI args, e.g. `/path/to/daybook.xml`). You have no real sample file
to test against. The original ledger-level parser was verified against "all 788 real vouchers in
this factory's export" per its own comment — you cannot reproduce that verification. Build
against the documented structure (below) and Tally's well-known item-invoice-mode XML shape, but
**do not claim this is verified against real data** in your review request — say plainly that
real-data verification is pending and can only be done by the Owner running an extended
`validate-tally-parser.js` against his actual export (same pattern as historical-backfill
execution — see the project's standing rule that real-data runs against real business files are
the Owner's own manual step, not the team's).

### What to build

**1. Schema (new migration required):**
Add a new model for voucher-level item detail — separate from `TallyLedgerEntry` (which is one
row per ledger account line, a different granularity than one row per stock item per voucher).
Something like:
```prisma
model TallyVoucherItem {
  id                  String           @id @default(uuid())
  tallyImportBatchId  String           @map("tally_import_batch_id")
  batch               TallyImportBatch @relation(fields: [tallyImportBatchId], references: [id])
  voucherType         String?          @map("voucher_type")
  entryDate           DateTime?        @map("entry_date") @db.Date
  stockItemName       String?          @map("stock_item_name")
  quantity            Decimal?         @db.Decimal(12, 2)
  amount              Decimal?         @db.Decimal(14, 2)

  @@map("tally_voucher_item")
}
```
Add the inverse relation on `TallyImportBatch`. Generate the migration the same way Step 2 did
(`prisma migrate diff --from-url ... --to-schema-datamodel ...`, since `migrate dev` needs an
interactive TTY not available in this environment) — do not hand-write migration SQL from
scratch, follow that precedent.

**2. Parser extension (`TallyParserService.parseDaybook`):**
Tally's item-invoice-mode vouchers nest stock item detail inside
`ALLINVENTORYENTRIES.LIST` (the same structure the existing code already partially traverses at
~line 87-88 to reach `ACCOUNTINGALLOCATIONS.LIST` for the accounting side). Each
`ALLINVENTORYENTRIES.LIST` entry carries the item name and quantity fields directly (commonly
`STOCKITEMNAME`, and a quantity field — Tally exports typically use `ACTUALQTY` and/or
`BILLEDQTY`, both formatted as a string like `"2260 SQF"` combining number and unit, not a bare
number — you'll need to parse the numeric prefix out). Extract one `ParsedVoucherItem` per
inventory entry: `{ voucherType, entryDate, stockItemName, quantity, amount }`, where `amount`
is the entry's own accounting allocation amount (same value you're already reaching via
`ACCOUNTINGALLOCATIONS.LIST` for the ledger-line path — reuse rather than re-deriving).

Only Sales-type vouchers are relevant for the sqft cross-check this unlocks, but don't filter by
voucher type at parse time — store what's there and let the report layer (below) filter. Keep
this additive: `parseDaybook`'s existing return value/behavior for ledger lines must not change
even one output row for any existing caller.

**3. Storage:**
`TallyImportService.importDaybook()` currently writes `tallyLedgerEntry.createMany(...)` inside
its transaction. Add a second `createMany` in the same transaction for the new
`tallyVoucherItem` rows, scoped to the same `batch.id`. Return `itemsImported` count alongside
the existing `entriesImported` in the method's return value.

**4. Cross-check report:**
Add a new endpoint (e.g. `GET /tally-import/item-cross-check?from&to` on
`TallyImportController`) that, for the given date range: sums `TallyVoucherItem.quantity` for
Sales-type vouchers (group by `entryDate` or return a total — your call, a simple total is
enough, this doesn't need to be a full reconciliation UI), and separately sums
`SalesLineItem.quantity` for `SalesOrder`s with `orderDate` in the same range (scoped to
`factoryId` via the existing `salesOrder` → `customer`/`factory` relation — check
`sales-order.service.ts` for the existing factory-scoping pattern and match it). Return both
totals and the delta. No frontend UI required for this step — an endpoint the Owner can query
directly (e.g. via curl/Postman) is enough; if you want to add a minimal display, a small
addition to an existing page is fine, but don't build a new page for it (out of scope — this is
a diagnostic tool, not a used-daily feature).

### Flags
- Local Postgres has 0 `SalesOrder`/`SalesLineItem` rows right now (only backfilled
  `DailySalesSummary` aggregate rows exist — a different model, see `handoff/BUILD-LOG.md` Step
  4 verification notes) — the cross-check will correctly show 0 on both sides locally. That's
  expected, not a bug.
- Do not attempt to also import/reconcile `TallyTrialBalanceSnapshot` item-level detail — trial
  balance exports don't carry item detail at all, only the daybook does. Scope is `parseDaybook`
  only.
- Do not touch the existing ledger-entry parsing logic's *output* — only add alongside it.
- Flag in your review request exactly which Tally tag names you inferred vs. verified against
  the code comments already in this file — be explicit about what's a guess.

### Definition of Done
- [ ] New `TallyVoucherItem` model + migration (generated via the `migrate diff` pattern, not
      hand-written)
- [ ] `parseDaybook` extracts item-level detail additively — existing ledger-line output
      unchanged (verify with a regression check against the existing parser test/validation
      script if one runs without a real file, otherwise reason through it explicitly)
- [ ] `importDaybook` stores both ledger entries and voucher items in the same transaction
- [ ] `GET /tally-import/item-cross-check?from&to` returns Tally-side sqft total, StoneOS-side
      sqft total, and the delta, scoped to the caller's `factoryId`
- [ ] Review request explicitly states real-data verification is NOT done and is the Owner's
      manual step
- [ ] `tsc --noEmit` clean, `npm run build` clean
- [ ] `handoff/REVIEW-REQUEST.md` written in this worktree

---

## Builder Plan
*Builder adds their plan here before building. Architect reviews and approves.*

Recorded 2026-07-12 by Bob. No reachable DB in this worktree (no `.env`, `localhost:5432`
connection refused) and no interactive TTY, so proceeding straight to build per the brief's
fallback instruction — plan recorded for the record, not gating on a reply this run.

**1. Schema** — add `TallyVoucherItem` to `packages/backend/prisma/schema.prisma` exactly as
sketched in the brief, plus the inverse `voucherItems TallyVoucherItem[]` relation on
`TallyImportBatch`. Field types/names copied verbatim from the brief (already match the
`tally_ledger_entry` sibling's conventions: nullable `String?`/`DateTime? @db.Date`, `Decimal?`).

**2. Migration** — no reachable `DATABASE_URL` in this worktree, so `prisma migrate diff` cannot
run here. Hand-writing `prisma/migrations/<timestamp>_tally_voucher_item/migration.sql` to match
the exact DDL conventions used in `20260709122654_init/migration.sql` for `tally_ledger_entry`
(same column order, `DECIMAL(12,2)`/`DECIMAL(14,2)` precision from the brief's sketch, FK with
`ON DELETE RESTRICT ON UPDATE CASCADE` matching `tally_ledger_entry`'s FK to
`tally_import_batch`). Will flag clearly in BUILD-LOG and REVIEW-REQUEST that this migration was
hand-written, not tool-generated, and needs double-checking against a real `migrate diff` run
once a DB is reachable.

**3. Parser (`TallyParserService.parseDaybook`)** — add a second accumulator array
(`ParsedVoucherItem[]`) alongside the existing `lines` loop, walking the same `inventoryEntries`
(`ALLINVENTORYENTRIES.LIST`) array already extracted at line 87 for structure 3. For each
inventory entry: read `STOCKITEMNAME` for `stockItemName`; read quantity from `ACTUALQTY` (fall
back to `BILLEDQTY` if absent) and regex out the leading numeric prefix (Tally formats these as
`"2260 SQF"` — a string, not a bare number); reuse the entry's own
`ACCOUNTINGALLOCATIONS.LIST[].AMOUNT` (already being summed into `nestedAllocEntries` for the
ledger path) as `amount` rather than re-deriving it, summing across that entry's allocation lines
if there's more than one. `voucherType`/`entryDate` reused from the same voucher-level variables
already in scope. Entries with no stock item name are skipped (mirrors the existing
`if (!account...) continue` guard style). Existing `lines` (ledger) array/loop/return value is
untouched — the new array is purely additive, returned as a second field on a new return shape
`{ lines, items }` (this is a signature change on `parseDaybook`'s return type, but the *ledger
line* content/count is unchanged for any caller — flagging this as the one deviation from "don't
change parseDaybook's signature," since brief only guarantees output rows, not the wrapper
shape). All three inferred tag names (`STOCKITEMNAME`, `ACTUALQTY`, `BILLEDQTY`) will be flagged
explicitly in the review request as guesses, not verified against the code's own comments (only
`ALLINVENTORYENTRIES.LIST`, `ACCOUNTINGALLOCATIONS.LIST`, `LEDGERNAME`, `AMOUNT` are verified per
the existing comment block).

**4. Storage (`TallyImportService.importDaybook`)** — add
`tx.tallyVoucherItem.createMany({ data: items.map(...) })` in the same transaction, scoped to
`batch.id`, alongside the existing `tallyLedgerEntry.createMany`. Return value gains
`itemsImported: items.length` next to `entriesImported`.

**5. Cross-check endpoint** — `GET /tally-import/item-cross-check?from&to` on
`TallyImportController`, backed by a new method on `TallyImportService`. Tally-side: sum
`TallyVoucherItem.quantity` where `batch.factoryId = factoryId`, `entryDate` between from/to, and
`voucherType` looks like a Sales voucher — using `equals: "Sales", mode: "insensitive"` (a guess,
will flag: real Tally voucher-type names are configurable per company, e.g. could be "Sales -
Local" — noted as an open question). StoneOS-side: sum `SalesLineItem.quantity` for
`SalesOrder.factoryId = factoryId` and `orderDate` between from/to (matches the direct
`factoryId` column on `SalesOrder`, same scoping style as `SalesOrderService.findAll`/`findOne` —
brief mentions a customer/factory relation but `SalesOrder` already carries `factoryId` directly,
simpler). Returns `{ tallySqft, stoneosSqft, delta }`. No frontend UI added (out of scope per
brief).

**Verification plan**: no real Tally XML sample available in this worktree (confirmed — brief's
constraint), so `validate-tally-parser.js` cannot be run against real data and the "788 real
vouchers" balance-invariant check cannot be reproduced. Will reason through the additive-only
claim by inspection (new code only reads additional fields off the same already-traversed
`inventoryEntries` array and pushes to a separate array; the existing `lines` push/loop body is
untouched) and rely on `tsc --noEmit` + `npm run build` passing as the only available automated
signal. Review request will state real-data verification is NOT done and is the Owner's manual
step, per the brief.
