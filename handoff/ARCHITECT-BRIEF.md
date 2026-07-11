# Architect Brief
*Written by Architect. Read by Builder and Reviewer.*
*Overwrite this file each step — it is not a log, it is the current active brief.*

---

## Step 2 — RawBlock opening-balance / entry-provenance support

### Source material
Project Owner supplied a draft schema diff, draft migration SQL, and a draft standalone
service file (`raw-block-intake.service.ts`) worked out externally. These are a good starting
point but were written without direct access to this schema — several fields don't match
reality. Corrections below are not optional adaptations, they're required for this to
compile/run correctly. Reference files are at
`_temp/raw-block-intake-draft/` (schema-additions.prisma, migration_opening_balance.sql,
raw-block-intake.service.ts — gitignored, project-local) — read them for the overall shape,
but do not copy them verbatim given the corrections below.

### Decisions

**Schema additions** — merge `schema-additions.prisma`'s content into `schema.prisma` as-is,
it's correct: `RawBlock.entrySource/costStatus/sourceFactoryId/transferredFromBlockId/
transferredToBlocks/reconciledAt/reconciledBy`, `Factory.blockTransfersOut`,
`CuttingSession.isBackfilled`, `PolishingSession.isBackfilled`, `Slab.isBackfilled`, new
`BlockReconciliation` model. All additive, no existing field changes.

**Migration** — do NOT copy `migration_opening_balance.sql` verbatim (its hand-typed column
types, e.g. `reconciled_by UUID`, don't match a Prisma `String` field with no `@db.Uuid` and
would cause drift on the next `prisma migrate dev`). Instead: run `prisma migrate dev
--create-only` (or equivalent) against the real schema to generate the actual migration, then
manually append this exact backfill statement (from the draft, this part is correct) to the
generated `migration.sql`:
```sql
UPDATE raw_block
SET entry_source = 'purchase', cost_status = 'confirmed'
WHERE invoiced_amount IS NOT NULL;
```

**Service location** — merge the create/reconcile logic into the EXISTING
`raw-block.service.ts`/`raw-block.controller.ts`. Do NOT create a separate
`RawBlockIntakeService` class — the draft's file name/structure was written standalone; this
codebase's existing `RawBlockService.create()` is the thing to extend. Its current form:
```ts
create(factoryId: string, input: CreateRawBlockInput) {
  return this.prisma.rawBlock.create({ data: { factoryId, currentStatus: "in_stock", ...input } });
}
```
Note it currently does NOT write a BlockStateTransition on create at all. Adding the
`fromState: null` transition on every create path (per instruction 3) is a real, deliberate
behavior change to the existing purchase path too, not just the new ones — that's intended
and good (consistent audit trail), just flagging it's not purely additive to behavior, only to
schema/fields.

**Fix required — machineId must be required for mid_cutting, not optional.**
`CuttingSession.machineId` is a non-nullable FK in this schema (`machineId String @map(...)`,
mandatory relation to `Machine`). The draft's instruction called it optional for mid_cutting —
that's not possible given the existing schema (which this brief does not authorize changing).
Make `machineId` a required input whenever `startingState` is `mid_cutting` or
`finished_stock`.

**Fix required — finished_stock needs TWO machine IDs, not one.** The draft reuses a single
`input.machineId` for both the CuttingSession (needs a cutting-type machine, e.g. B-21) and the
PolishingSession (needs a polishing-type machine, e.g. LPM) — those are always different
`Machine` rows (`Machine.machineType` is `"cutting"` or `"polishing"`). Rename/split the input
into `cuttingMachineId` and `polishingMachineId` for the `finished_stock` case (mid_cutting only
needs `cuttingMachineId`, no polishing machine yet). Optionally validate each machine's
`machineType` matches what it's being used for (nice-to-have, not required).

**Fix required — PolishingSession needs `operationalDate` and `finishType`, both required,
non-nullable in the real schema.** The draft never sets these. Use `input.finish` (rename to
avoid confusion with `Slab.finish`, or just reuse — your call) for `finishType`, and default
`operationalDate` to `new Date()` (same "approximate, real event predates StoneOS" pattern
already used for `CuttingSession.startedAt/endedAt`).

**Fix required — no `totalSlabsProduced` field exists.** Real `CuttingSession` fields are
`totalSlabsCut`, `finalGoodSlabCount`, `damagedSlabCount` (all nullable Int). For the
finished_stock backfill path, set `totalSlabsCut: expectedTotalSlabs`,
`finalGoodSlabCount: expectedTotalSlabs`, `damagedSlabCount: 0` (we're registering exactly
`expectedTotalSlabs` slabs as good, so nothing was damaged in this backfill scenario).

**Fix required — `user.name` doesn't exist.** This app's `AuthenticatedUser` interface
(`common/decorators/current-user.decorator.ts`) only has `id`, `email`, `factoryId`, `role` —
no `name`. Use `user.email` wherever the draft used `user.name ?? user.id`.

**No class-validator/DTOs anywhere in this codebase** — confirmed by grep, zero hits, no
`ValidationPipe` in `main.ts` either. Every controller uses `@Body() body: any` with manual
checks in the service layer (see `expense.service.ts`'s `EXPENSE_CATEGORIES.includes()` +
`BadRequestException` pattern). Follow that exact convention for the new create/reconcile
inputs — do not introduce class-validator, that would be inconsistent with the rest of the
codebase and out of scope for this ticket.

**Role gating — two different mechanisms needed, because the requirement differs per
endpoint:**
- `create`: gating is CONDITIONAL on `entrySource` in the request body (allow all roles for
  `"purchase"`, require elevated for anything else) — the declarative `@Roles()` decorator +
  `RolesGuard` can't express body-conditional logic (it only reads route metadata), so keep
  this as a manual in-service check, same shape as the draft:
  `const ELEVATED_ROLES = ["owner", "admin", "manager"];` then
  `if (input.entrySource !== "purchase" && !ELEVATED_ROLES.includes(user.role)) throw new ForbiddenException(...)`.
- `reconcile`: this ALWAYS requires elevated/accountant regardless of body — use this
  codebase's actual declarative pattern instead of a manual check, matching
  `provision-user.controller.ts` exactly:
  ```ts
  @Controller("raw-blocks")
  @UseGuards(ClerkAuthGuard, RolesGuard)
  ...
  @Post(":id/reconcile")
  @Roles("owner", "admin", "manager", "accountant")
  reconcile(...) { ... }
  ```
  Note: `RolesGuard` must run after `ClerkAuthGuard` (existing convention, see
  `roles.guard.ts`'s own comment) — the existing `create`/`findAll`/etc. methods on this
  controller have no `@Roles()` so they're unaffected by adding `RolesGuard` to the class-level
  `@UseGuards()` (a route with no `@Roles()` metadata passes through, per `RolesGuard`'s own
  `if (!requiredRoles || requiredRoles.length === 0) return true`).
- "manager" and "accountant" are already valid, existing roles (`VALID_ROLES` in
  `provision-user.service.ts`) — no role-model changes needed anywhere else.

**Policy decision, Project Owner, post-review — `transfer_in` is disabled for now, no
cross-factory logic of any kind.** Richard's review correctly escalated that `validateTransferIn`
inherently requires cross-factory `Factory`/`RawBlock` lookups, which conflicts with this
codebase's stated tenant-isolation invariant, and there's no `Company`/grouping concept
constraining which factories may transfer between each other. Project Owner's decision: **all
factories are independent units, full stop — no cross-factory data access of any kind until a
proper multi-factory model is built at the login/access layer.** That means:
- Remove `"transfer_in"` from the accepted `entrySource` allowlist entirely for now (it should
  be rejected the same way any invalid `entrySource` is — see the Must Fix entrySource
  validation fix below). Do not implement or expose any code path that queries another
  factory's `Factory` or `RawBlock` rows.
- Remove `validateTransferIn` and its call site entirely, rather than leaving unreachable
  dead code — this isn't "not needed yet," it's explicitly disallowed right now.
- Keep the schema fields (`sourceFactoryId`, `transferredFromBlockId`, `transferredToBlocks`,
  `Factory.blockTransfersOut`) — they're harmless, additive, and fine to have in place for
  whenever multi-factory support is actually built properly. Just nothing in the service layer
  should read or write them yet.
- This also fully resolves Richard's Must Fix #2 as it applies to `transfer_in` (moot, since
  that branch no longer exists) — but `validateMachineType`'s missing `factoryId` filter is
  still a real bug for the `opening_balance` path (mid_cutting/finished_stock), which stays
  strictly single-factory and still needs the fix below.

**Security fix, Architect's own call (not from the draft) — validate `sourceFactoryId`/
`transferredFromBlockId` for `transfer_in` entries.** The draft accepts these as raw input with
no validation that they're real/consistent, which matters given this codebase's stated
tenant-isolation invariant ("no global list-everything query... if you add one, you've broken
tenant isolation" — README). Add: if `sourceFactoryId` given, verify it's a real `Factory` row
(404/400 if not); if `transferredFromBlockId` also given, verify that block actually belongs to
`sourceFactoryId` (400 if it doesn't — prevents fabricating a lineage that references another
factory's block inconsistently). This does not need to block a legitimate same-company
multi-factory transfer, just catch inconsistent/fabricated input.

**Reconcile cost_status rule** (from the draft, correct as specified): reconciling
`weightTons` while `costStatus` is `"estimated"` keeps it `"estimated"`; reconciling
`invoicedAmount` or `actualAmountPaid` (or `weightTons` when cost_status isn't already
`"estimated"`) sets `costStatus: "confirmed"`. `BlockReconciliation` row logs old/new value,
`reconciledBy: user.id`, `reconciledAt: now()`.

### Build Order
1. Merge schema additions into `schema.prisma`.
2. Generate the migration properly (`prisma migrate dev --create-only` or equivalent), append
   the backfill UPDATE statement, apply it against LOCAL Postgres only (same DB this session's
   Step 1 backfill used — do not touch production).
3. Extend `raw-block.service.ts`/`raw-block.controller.ts` per the corrections above — create
   path (purchase/opening_balance/transfer_in branching, mid_cutting and finished_stock
   session/slab reconstruction, sourceFactory/transfer validation) and reconcile
   path/endpoint.
4. Manual validation in the service layer matching `expense.service.ts`'s style — no
   class-validator.
5. Write `handoff/REVIEW-REQUEST.md` and stop for Richard's review. Do not attempt to run any
   data-writing action against production.

### Flags
- Flag: do not touch production database at any point in this step — local Postgres only,
  same as Step 1.
- Flag: if anything else in the draft files doesn't match this schema/codebase beyond what's
  listed above, list it in the review request rather than guessing or silently working around
  it.
- Flag: keep the existing purchase-only `create()` callers (if any exist elsewhere in the
  codebase — grep for `RawBlockService` usages) working exactly as before for `entrySource:
  "purchase"` input; this is an extension, not a rewrite.

### Definition of Done
- [ ] Schema migration applies cleanly against local Postgres, backfill UPDATE runs
- [ ] `create()` handles all three entrySource branches correctly, gated per the rules above
- [ ] `reconcile()` endpoint works, gated via `@Roles("owner","admin","manager","accountant")`
- [ ] No class-validator introduced; manual validation matches existing codebase convention
- [ ] `handoff/REVIEW-REQUEST.md` written, listing any further draft/schema mismatches found

---

## Builder Plan
*Builder adds their plan here before building. Architect reviews and approves.*

**Brief verified against actual codebase before building** — checked schema.prisma
(RawBlock, Factory, CuttingSession, PolishingSession, PolishingSessionSlab, Slab,
BlockStateTransition, Machine), `current-user.decorator.ts`, `roles.guard.ts`,
`roles.decorator.ts`, `provision-user.controller.ts`/`.service.ts`, `expense.service.ts`,
and grepped for other `RawBlockService`/`RawBlockController` usages (only
`inventory.module.ts` wires it — no other callers to preserve compat for beyond the
service's own `create()` signature). All of the brief's stated corrections match reality
exactly: `CuttingSession.machineId` is required, `PolishingSession.operationalDate` /
`finishType` / `machineId` are all required non-null (confirms the two-machine-ID split is
necessary since each PolishingSession has exactly one `machineId`), no
`totalSlabsProduced` field exists (`totalSlabsCut`/`finalGoodSlabCount`/`damagedSlabCount`
do), `AuthenticatedUser` has no `name`, no class-validator anywhere, `RolesGuard`/`@Roles()`
pattern matches `provision-user.controller.ts` exactly, `manager`/`accountant` already in
`VALID_ROLES`. Local Postgres confirmed running (`stoneos-postgres-1`, port 5432),
`DATABASE_URL` points at it, one prior migration (`20260709122654_init`). Brief is complete
— no open questions. Proceeding to build.

Plan:
1. Merge `schema-additions.prisma` content into `schema.prisma` verbatim (additive only).
2. `prisma migrate dev --create-only` against local DB to generate the real migration SQL,
   then append the exact backfill `UPDATE raw_block ...` statement from the brief. Apply
   with `prisma migrate dev` (local only).
3. Extend `CreateRawBlockInput` in `raw-block.service.ts` to cover all three entrySource
   branches (purchase/opening_balance/transfer_in), with `cuttingMachineId`/
   `polishingMachineId` split, `operationalDate` default, `finish` for `finishType`,
   `totalSlabsCut`/`finalGoodSlabCount`/`damagedSlabCount` per brief, sourceFactory/
   transferredFromBlock validation, and the `fromState: null` BlockStateTransition on every
   create. Existing purchase-shape callers keep working since `entrySource` defaults to
   `"purchase"` and all new fields are optional/branch-gated.
4. Add `reconcile()` method with the cost_status rule as specified.
5. Controller: keep manual entrySource-conditional check in service for `create`; add
   `RolesGuard` at class level + `@Roles("owner","admin","manager","accountant")` on new
   `POST :id/reconcile` route, matching `provision-user.controller.ts`.
6. Update `handoff/BUILD-LOG.md`, write `handoff/REVIEW-REQUEST.md`, stop.

Architect approval: [x] Approved (brief is fully specified and self-contained; proceeding
per dispatch instructions — no ambiguity requiring escalation before building)
