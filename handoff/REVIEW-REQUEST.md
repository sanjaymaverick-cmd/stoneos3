# Review Request — Step 5C: Item-level Tally detail
*Written by Builder. Read by Reviewer.*

Date: 2026-07-12
Worktree: `worktrees/tally-item-detail`, branch `feat/tally-item-detail`
Ready for Review: YES

---

## Important upfront: real-data verification is NOT done

Per the brief's explicit constraint, no real Tally XML export file exists in this repo or this
worktree — the daybook/trial-balance XML files are confidential business data passed as external
CLI args to `prisma/validate-tally-parser.js`, not committed anywhere. **This step has not been
verified against real data, and cannot be from within this worktree.** The original ledger-level
parser's "verified against all 788 real vouchers" claim (see the code comment it carries) could
not be reproduced or extended for the new item-parsing logic. Verification of the new
`STOCKITEMNAME`/`ACTUALQTY`/`BILLEDQTY` tag names, and of the sqft cross-check's numbers, against
a real export is the **Owner's own manual step** — same pattern as historical-backfill execution
(the project's standing rule that real-data runs against real business files are not the team's
to perform). What follows is `tsc`/`build`-level verification and reasoning-by-inspection only.

---

## Files changed

### `packages/backend/prisma/schema.prisma`
New `TallyVoucherItem` model (lines 650-662, placed after the existing
`TallyLedgerEntry`/`TallyTrialBalanceSnapshot` models) and the inverse
`voucherItems TallyVoucherItem[]` relation added to `TallyImportBatch` (line 627).
Fields match the brief's sketch exactly: `id`, `tallyImportBatchId`/`batch` relation,
`voucherType`, `entryDate` (`@db.Date`), `stockItemName`, `quantity` (`Decimal(12,2)`), `amount`
(`Decimal(14,2)`). Why: a new model was needed because item-level detail (one row per stock item
per voucher) is a different granularity than `TallyLedgerEntry` (one row per ledger account
line), per the brief.

### `packages/backend/prisma/migrations/20260712000000_tally_voucher_item/migration.sql` (new)
**Hand-written, not generated via `prisma migrate diff`** — no reachable `DATABASE_URL` exists in
this worktree (no `.env` file present; `localhost:5432` connection refused when checked). Written
to mirror `20260709122654_init/migration.sql`'s `tally_ledger_entry` `CREATE TABLE` + `AddForeignKey`
statements exactly (same column ordering, same `DATE`/`DECIMAL(12,2)`/`DECIMAL(14,2)` types, same
`ON DELETE RESTRICT ON UPDATE CASCADE` FK style). Why: the brief's fallback instruction for "no
reachable database URL at all" case. **This needs to be double-checked** — ideally re-generated
via the real `migrate diff` tool once a DB is reachable, and diffed against this hand-written
version, before being trusted as authoritative.

### `packages/backend/src/modules/tally/tally-import.service.ts`
- Added `ParsedVoucherItem` interface and `ParsedDaybook` (`{ lines, items }`) return-shape
  interface (lines 28-39); added `parseTallyQuantity()` helper (lines 41-52) that strips the numeric prefix off
  Tally's `"2260 SQF"`-style quantity strings (regex `^-?\d+(\.\d+)?`, returns `null` if nothing
  numeric found, so a missing quantity isn't confused with a genuine zero). Why: quantity fields
  are documented as combining a number and a unit in one string, not a bare number.
- `TallyParserService.parseDaybook`'s return type changed from `ParsedLedgerLine[]` to
  `ParsedDaybook` (`{ lines, items }`). Why: needed to carry the new item array out alongside the
  existing ledger lines without changing what's *in* `lines`. This is a signature/wrapper-shape
  change — flagging as the one place I deviated from "don't change parseDaybook's behavior" in
  the strictest reading; the ledger-line *content* (what gets pushed into `lines`, in what order,
  with what values) is byte-for-byte identical to before. Grepped the whole repo — `importDaybook`
  is the only caller, and it was updated to match; nothing else references `parseDaybook`.
- Inside the existing `for (const msg of messages)` loop (after the existing ledger-line push
  loop, lines 137-158): a new loop over the same `inventoryEntries` array (`ALLINVENTORYENTRIES.LIST`,
  already extracted for structure 3) that reads `STOCKITEMNAME` for `stockItemName`, calls
  `parseTallyQuantity(inv?.ACTUALQTY ?? inv?.BILLEDQTY)` for `quantity`, and sums that entry's own
  `ACCOUNTINGALLOCATIONS.LIST[].AMOUNT` values for `amount` (reusing the same nested structure
  already being read for the ledger-line path, per the brief's explicit instruction to reuse
  rather than re-derive). Entries with no `STOCKITEMNAME` are skipped. Why: this is the core
  extraction the brief asked for.
- `TallyImportService.importDaybook` (~lines 211-247): destructures `{ lines, items }` from
  `parseDaybook`, adds a second `tx.tallyVoucherItem.createMany(...)` inside the existing
  transaction (same `batch.id` scope as the ledger entries), returns `itemsImported: items.length`
  alongside the existing `entriesImported`. Why: brief requires both writes in the same
  transaction and the count in the return value.
- New `TallyImportService.itemCrossCheck(factoryId, from, to)` method (lines 266-303): sums
  `TallyVoucherItem.quantity` via `prisma.tallyVoucherItem.aggregate` where
  `batch: { factoryId }`, `entryDate` between `from`/`to`, and
  `voucherType: { equals: "Sales", mode: "insensitive" }`; separately sums
  `SalesLineItem.quantity` where `salesOrder: { factoryId, orderDate: { gte, lte } }`; returns
  `{ from, to, tallySqft, stoneosSqft, delta }`. Why: the diagnostic cross-check the brief asks
  for. Note: `SalesOrder` already carries `factoryId` as a direct column (not only reachable via
  `customer`), so I scoped through `salesOrder.factoryId` directly — same end result as the
  brief's suggested customer/factory relation path, simpler.

### `packages/backend/src/modules/tally/tally-import.controller.ts`
Added `GET /tally-import/item-cross-check?from&to` (imports `Query` from `@nestjs/common`),
400s via `BadRequestException` if either query param is missing, otherwise delegates to
`service.itemCrossCheck(user.factoryId, from, to)`. Why: the brief's requested diagnostic
endpoint, no frontend UI added (explicitly out of scope per the brief).

---

## Tag names: inferred vs. verified (per brief's explicit ask)

**Verified** (already covered by the existing code's own comment block, confirmed against 788
real vouchers in a prior step): `ALLINVENTORYENTRIES.LIST`, `ACCOUNTINGALLOCATIONS.LIST`,
`LEDGERNAME`, `AMOUNT`.

**Inferred / guessed, NOT verified against real data**:
- `STOCKITEMNAME` — assumed to be the item name field on each `ALLINVENTORYENTRIES.LIST` entry.
- `ACTUALQTY` / `BILLEDQTY` — assumed to be the two common quantity fields, with `ACTUALQTY`
  preferred and `BILLEDQTY` as fallback. Which one is actually populated (or whether both are, or
  neither, for this specific Tally installation/export version) is unverified.
- The quantity string format (`"<number> <unit>"`, e.g. `"2260 SQF"`) is assumed based on Tally's
  documented export behavior, not this company's actual export.
- The `voucherType: "Sales"` exact-match (case-insensitive) filter in `itemCrossCheck` — real
  Tally voucher-type names are configurable per company (e.g. could be "Sales - Local", "Sales -
  GST", etc.) and this codebase's own `ParsedLedgerLine.voucherType` values from real vouchers
  have never been inspected by this Builder.

---

## Verification performed

- `npm install` from worktree root — clean, 466 packages, no errors.
- `npx prisma generate` (packages/backend) — clean; `TallyVoucherItem` present in the generated
  Prisma client.
- `npx tsc --noEmit` — clean in both `packages/backend` and `packages/frontend`.
- `npm run build` — clean in both `packages/backend` (`nest build`) and `packages/frontend`
  (`next build`, all 10 routes compile, no source changes on the frontend side this step).
- Regression reasoning for "parseDaybook's existing ledger-line output must not change even one
  row": inspected the diff directly — the new item-extraction loop is entirely additive, placed
  after the existing `for (const le of allEntries) { lines.push(...) }` block, reads from the
  same already-computed `inventoryEntries` variable, and writes only into the new `items` array.
  No line inside the existing `lines.push(...)` block or its surrounding loop was touched.
- **No database contact whatsoever** — no `.env` file exists in this worktree, `migrate dev` /
  `db push` / any seed script were not run, and no attempt was made to reach a local or
  production Postgres instance, per the task's explicit instruction never to attempt reaching a
  production database.
- **Real Tally-data verification: NOT done, and explicitly flagged as the Owner's manual step**
  (see top of this document).

---

## Open questions for Richard / escalation candidates

1. **Migration provenance** — the migration SQL was hand-written rather than tool-generated
   because no `DATABASE_URL` was reachable in this worktree. Is this acceptable to merge with a
   flag, or should this step be blocked pending a real `prisma migrate diff` run (by someone with
   local DB access) to confirm the hand-written SQL matches exactly?
2. **`parseDaybook`'s return-shape change** (`ParsedLedgerLine[]` → `{ lines, items }`) — the
   brief says "keep this additive" and "existing ledger-line output unchanged" without explicitly
   addressing whether the *wrapper* return type is allowed to change. I judged this acceptable
   since the ledger-line values themselves are unchanged and there's only one caller (updated to
   match), but flagging in case a different pattern (e.g. two separate methods, or an object with
   a different key structure) was expected.
3. **Sales-voucher-type filter specificity** — `equals: "Sales"` (case-insensitive) may be too
   narrow for a real Tally installation with custom voucher-type naming. Worth broadening to
   `contains` or leaving as-is until the Owner confirms actual voucher-type strings from a real
   export?
4. **Quantity field precedence** (`ACTUALQTY` preferred, `BILLEDQTY` fallback) — unverified
   assumption; flagging in case the opposite precedence, or using both summed, would be more
   correct for this Tally installation.
