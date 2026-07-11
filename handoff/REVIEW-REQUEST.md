# Review Request — Step 2 (Round 2)
*Written by Builder. Read by Reviewer.*

Ready for Review: YES

---

## What Changed Since Round 1

Richard's `handoff/REVIEW-FEEDBACK.md` (2026-07-11, Ready for Builder: NO) found 3 Must Fix
bugs and 5 Should Fix items. Separately, the Project Owner resolved Richard's "Escalate to
Architect" item directly: **`transfer_in` is disabled entirely — no cross-factory data access
of any kind until a proper multi-factory model is built at the login/access layer.** Both are
addressed in this round.

## Must Fix — All 3 Resolved

1. **`entrySource` never validated against its allowlist at runtime**
   (`raw-block.service.ts`) — a bogus value (or, previously, `"transfer_in"`) would sail past
   the role check and fall through to `costStatus: "confirmed"` / `currentStatus: "in_stock"`.
   Fixed: `ENTRY_SOURCES` allowlist (now just `["purchase", "opening_balance"]` — see scope
   change below) checked up front, `BadRequestException` otherwise, same pattern as
   `RECONCILE_FIELDS`.
2. **`validateMachineType` had no `factoryId` filter** — the only unscoped `Machine` lookup in
   the codebase, letting an `opening_balance` intake attach a different factory's machine to a
   new `CuttingSession`/`PolishingSession`. Fixed: now takes `factoryId` and uses
   `findFirst({ where: { id: machineId, factoryId } })`, matching `machine.service.ts`'s
   established pattern.
3. **`reconcile()`'s cost_status rule wrongly graduated non-estimated blocks to `confirmed`** —
   correcting `weightTons` on an ordinary still-`"pending"` purchase block (invoice not yet
   entered) unconditionally forced it to `"confirmed"`. Fixed:
   `costStatus: block.costStatus !== "estimated" ? block.costStatus : (fieldName === "weightTons" ? "estimated" : "confirmed")`
   — a block that isn't already `"estimated"` now keeps its existing `costStatus` untouched.

## Should Fix — 2 Taken, Rest Logged

Taken (both quick):
- `input.startingState` now validated against its 3-value allowlist (`STARTING_STATES`),
  `BadRequestException` on garbage input instead of silently defaulting to `raw_yard`.
- Guard against `sourceFactoryId === factoryId` was implemented, then **removed again** as a
  direct consequence of the scope change below — `sourceFactoryId` isn't accepted as input at
  all anymore, so the guard has nothing to guard.

Logged to `handoff/BUILD-LOG.md` as follow-ups (per the coordinator's instruction, not fixed
this round): missing minimum-data validation for `opening_balance` (nothing requires
`weightTons` be supplied), the `createMany`-vs-`Promise.all` efficiency note for finished_stock
slab creation. The "transfer_in not carrying forward source block's cost figures" item is now
moot — see below.

## Scope Change — `transfer_in` Disabled Entirely

Project Owner's direct decision (recorded in `handoff/ARCHITECT-BRIEF.md`), verbatim: *"no
cross factory data transfer. all factories independent units. once we are ready for multi
factory setup in app we will add that in login process so no cross factory data leak
happens."*

Implemented:
- `EntrySource` type and `ENTRY_SOURCES` allowlist now only accept `"purchase"` /
  `"opening_balance"`. Passing `entrySource: "transfer_in"` is rejected with
  `BadRequestException` through the same allowlist check as any other invalid value — no
  special-cased error path.
- **Deleted `validateTransferIn` entirely** (method + call site), not left as dead code.
- Removed `sourceFactoryId`/`transferredFromBlockId` from `CreateRawBlockInput` and from the
  `tx.rawBlock.create()` data object — the service no longer reads or writes either field.
- No code path in `raw-block.service.ts` queries another factory's `Factory` or `RawBlock` rows
  anymore.
- **Schema left untouched**, as instructed: `RawBlock.sourceFactoryId`/`transferredFromBlockId`/
  `transferredToBlocks` and `Factory.blockTransfersOut` remain in `schema.prisma` and the
  already-applied migration — harmless, additive, ready for whenever multi-factory support is
  built properly at the login/access layer.
- This also fully resolves Must Fix #2 as it applied to `transfer_in` (moot — that branch no
  longer exists); the fix still stands for the `opening_balance` path as described above.

## Files Changed (Round 2)

| File | Change |
|---|---|
| `packages/backend/src/modules/inventory/raw-block.service.ts` | All 3 Must Fix bugs; 2 Should Fix items; `transfer_in` fully removed (type, allowlist, `validateTransferIn`, input fields, create() data). No schema/migration changes. |

`raw-block.controller.ts` needed no changes this round (it never referenced `transfer_in` or
the removed fields directly).

## Verification

`tsc --noEmit` clean, `npm run build` clean. Re-ran the same throwaway-factory smoke test
approach as Round 1 (`scratchpad/smoke-test-raw-block.js`, not committed), updated to drop the
`transfer_in` create-path cases and add regression checks for all 3 Must Fix bugs plus the
scope change. **24/24 checks passed**, including the ones called out explicitly:

- `entrySource: "backdoor"` → rejected (400).
- `entrySource: "transfer_in"` → rejected (400) — confirms the disable is real, not just typed away.
- A cross-factory `cuttingMachineId` (belonging to a second throwaway factory) → rejected (400), and confirmed no `CuttingSession` row was created for it.
- Reconciling `weightTons` (and separately `invoicedAmount`) on a fresh, still-`"pending"` purchase block → `costStatus` stays `"pending"` in both cases, not forced to `"confirmed"`.
- All Round 1 checks (purchase legacy shape, role gating, mid_cutting/finished_stock reconstruction, wrong-machine-type rejection, reconcile's estimated→confirmed graduation rule) still pass unchanged.

Cleaned up all test rows afterward; confirmed via direct query that local Postgres is back to
exactly Step 1's state (1 `Factory`, 2,421 `Expense` rows, `raw_block` empty). No production
database contact at any point.

## Open Items Carried Forward

- Missing minimum-data validation for `opening_balance` (e.g. `weightTons` isn't required) —
  logged to BUILD-LOG.md, not fixed this round.
- `createMany` vs `Promise.all` for finished_stock slab creation — logged as an efficiency nit,
  not a correctness bug (individual creates are needed for the per-slab ids used by
  `PolishingSessionSlab` linking).
