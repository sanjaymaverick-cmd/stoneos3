# Review Request — Step 5B — Per-slab dimension overrides
*Written by Builder. Read by Reviewer.*

Date: 2026-07-12
Ready for Review: YES

---

## Files Changed

- `packages/backend/src/modules/production/cutting-session.service.ts`
  - Lines 34-46: `CompleteSessionInput` gains
    `slabOverrides?: { sequence: number; lengthFt?: number; widthFt?: number; thicknessMm?: number }[]`.
  - Lines 137-160 (new): validates, before the transaction opens, that every `sequence` in
    `slabOverrides` is a unique integer in `1..finalGoodSlabCount`; throws `BadRequestException`
    otherwise. Builds an `overridesBySeq` `Map<number, override>` for O(1) lookup in the
    generation loop.
  - Lines 191-207 (generation loop): each slab's `lengthFt`/`widthFt`/`thicknessMm` now resolves
    as `override?.field ?? input.field` (with the pre-existing `?? 18.0` thickness fallback still
    last in the chain), instead of always reading `input.field` directly.
- `packages/frontend/app/dpr/page.tsx`
  - Lines 30-33 (new state): `slabOverridesEnabled` (per-session toggle) and `slabOverrideRows`
    (per-session, per-sequence field values).
  - Lines ~118-149 (new): `updateSlabOverrideRow` and `buildSlabOverrides` — the latter compares
    each row's parsed values against the session-level defaults and returns only the sequences
    (and only the specific fields) that actually differ.
  - `submitCompletion` (~lines 151-183): only calls `buildSlabOverrides` when the toggle is on;
    only spreads `slabOverrides` into the request body when the resulting array is non-empty;
    resets the toggle/rows state after a successful submit.
  - JSX (~lines 325-373, inside the existing Complete Cutting block): a checkbox ("different
    sizes for some slabs?", default unchecked) that only renders once `finalGoodSlabCount` parses
    to a valid positive integer; when checked, renders one `.row-card`/`.row-grid` row per
    sequence (reusing the exact pattern `sales/page.tsx` already uses for repeatable line items)
    inside a `maxHeight: 320 / overflowY: auto` scroll container, each row pre-filled with the
    session-level default values and independently editable.

## What and Why

1. Backend field + validation — lets a supervisor record the rare mixed-size batch without
   inventing a new endpoint or migration; validation runs before any DB write so a bad request
   can't partially apply.
2. Backend generation-loop change — per-sequence override wins when present, session default
   otherwise, matching the brief's exact fallback rule (an override that only sets `lengthFt`
   doesn't force the supervisor to re-enter `widthFt`/`thicknessMm`).
3. Frontend toggle — opt-in, defaults off, so the 99% uniform-batch case is visually and
   functionally identical to before this step (no new fields render, no `slabOverrides` key is
   even present in the request body).
4. Frontend per-slab rows + minimal-diff payload — supervisor only has to touch the slabs that
   actually differ; everything else stays implicit via the session-level default, keeping the
   request small and matching the "99% uniform" framing from the brief.

## Open Questions / Uncertainties

None. The brief (`handoff/ARCHITECT-BRIEF.md`) was unambiguous on both the backend request shape
and the frontend UX; the Builder Plan section of that file records the plan as built, with no
deviations.

## Verification Performed

- `npm install` from the worktree root (fresh worktree, no prior `node_modules`), then
  `npx prisma generate` in `packages/backend` (schema-only codegen, no DB connection — needed
  because a fresh `node_modules` doesn't ship a generated Prisma Client, which was surfacing as
  15 unrelated `implicit any` errors across several pre-existing files until generated).
- `npx tsc --noEmit` — clean in both `packages/backend` and `packages/frontend`.
- `npm run build` — clean in both packages. Next.js build compiled successfully, ran its own
  lint/type pass, and generated `/dpr` (5.14 kB, 151 kB First Load JS, up from the pre-change
  baseline by the new toggle/row markup only).
- No live database contact anywhere (per this run's explicit instruction) — correctness verified
  by hand-tracing `complete()`'s logic instead:
  - **Default path (no `slabOverrides`)**: `overridesBySeq` is an empty `Map`, so
    `overridesBySeq.get(seq)` is `undefined` for every `seq` in the loop, collapsing
    `override?.field ?? input.field` to exactly `input.field` — and the thickness fallback chain
    collapses to exactly `input.thicknessMm ?? 18.0`, byte-identical to the pre-existing logic.
    Confirms the brief's core backward-compatibility requirement.
  - **Mixed-size path**: for `finalGoodSlabCount = 5` with one override
    `{ sequence: 3, lengthFt: 7.5 }`, traced that seq 3's slab gets `lengthFt: 7.5` plus the
    session-level `widthFt`/`thicknessMm` (override's `widthFt`/`thicknessMm` are `undefined`, so
    `?? input.field` applies), while seq 1, 2, 4, 5 get pure session defaults via the empty-map
    path above.
  - **Validation**: traced `sequence: 0`, `sequence: 6` (> `finalGoodSlabCount` of 5), and a
    duplicate `sequence: 3` appearing twice — all three throw `BadRequestException` before the
    `$transaction` callback runs, so no partial writes are possible.
- Frontend `buildSlabOverrides` traced by hand: a row left completely untouched (or explicitly
  re-typed to match the session default) is excluded from the payload; a row with one field
  changed produces an entry containing only that field plus `sequence` — matches the brief's
  "only include entries whose values differ" requirement.

## Definition of Done — Self-Check

- [x] Default (no overrides) completion behaves identically to today — verified by hand-tracing
      the empty-map collapse, not just new-path testing.
- [x] `slabOverrides` sequence validation rejects out-of-range/duplicate sequences with 400.
- [x] Generated slabs use per-sequence override values when present, session defaults otherwise.
- [x] Frontend toggle defaults off; per-slab rows only appear when explicitly enabled.
- [x] `tsc --noEmit` clean (both backend and frontend), `npm run build` clean.
- [x] `handoff/REVIEW-REQUEST.md` written in this worktree.
