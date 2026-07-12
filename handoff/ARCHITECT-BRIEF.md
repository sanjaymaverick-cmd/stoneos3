# Architect Brief
*Written by Architect. Read by Builder and Reviewer.*
*Overwrite this file each step — it is not a log, it is the current active brief.*

---

## Step 5B — Per-slab dimension overrides (README #5)

You are working in an isolated git worktree on branch `feat/slab-dimension-overrides`. This is
running in parallel with three other independent steps (each in their own worktree) — do not
assume anything about their state, do not touch files outside what this brief describes.

### What this is
`CuttingSession.complete()` in
`packages/backend/src/modules/production/cutting-session.service.ts` (~line 127-179) currently
takes ONE `lengthFt`/`widthFt`/`thicknessMm` and applies it to every generated `Slab` row (the
`for (let seq = 1; seq <= input.finalGoodSlabCount; seq++)` loop at line 166). This is correct
~99% of the time — slabs from one block are almost always uniform size — but README #5 flags
the rare mixed-size batch where a few slabs come out a different size and currently have no way
to be recorded correctly.

**Keep the common case exactly as simple as it is today.** This is an opt-in override, not a
redesign — a supervisor entering a normal uniform batch should see zero extra fields.

### Backend
In `CompleteSessionInput` (same file, ~line 34-43), add an optional field:
```ts
slabOverrides?: { sequence: number; lengthFt?: number; widthFt?: number; thicknessMm?: number }[];
```
`sequence` matches the loop's `seq` (1-based, same numbering used to build `slabSerial`). In the
generation loop, for each `seq`, look up whether `slabOverrides` has an entry for that sequence;
if so, use its `lengthFt`/`widthFt`/`thicknessMm` (falling back to the session-level default for
any of the three left unset in that specific override — e.g. a slab that's a different length
but the same width shouldn't require re-entering width); if not, use the existing session-level
`input.lengthFt`/`widthFt`/`thicknessMm` exactly as today.

Validate: every `sequence` in `slabOverrides` must be a unique integer in `1..finalGoodSlabCount`
(inclusive) — reject with 400 otherwise (`BadRequestException`, matching this file's existing
error style, e.g. the `finalGoodSlabCount > totalSlabsCut` check at line 128).

### Frontend
`packages/frontend/app/dpr/page.tsx` has the completion form (~line 119-135 builds the request
body, ~line 254-266 renders the `lengthFt`/`widthFt`/`thicknessMm` inputs). Add an opt-in
toggle per session — e.g. a small checkbox/link like "different sizes for some slabs?" — that
defaults OFF. When off, behavior is pixel-identical to today (single set of dimension inputs,
no `slabOverrides` sent). When on, render one row per sequence (`1..finalGoodSlabCount`, so this
needs `finalGoodSlabCount` to already be entered/known before the per-slab rows can render —
your call on exact UX, e.g. show the toggle only once `finalGoodSlabCount` has a value), each
row pre-filled with the session-level defaults and independently editable — the supervisor only
needs to touch the ones that actually differ. Only include entries whose values differ from the
session defaults in the submitted `slabOverrides` array (no need to send every row if most match
the default — smaller payload, and matches the "99% uniform" framing). Reuse existing
`globals.css` classes and the existing form style in this file — no new design system.

### Flags
- No schema/migration change — `Slab.lengthFt`/`widthFt`/`thicknessMm` already exist as
  per-row columns; this is purely a request-shape and generation-loop change.
- Do not touch `raw-block.service.ts`'s `computeDamagedSlabLoss` or anything sales/expense
  related — this step is scoped to `CuttingSession.complete()` and its frontend form only.
- `finalGoodSlabCount` can legitimately be large (e.g. 47) — if you render a full per-slab list,
  make sure it's scrollable/usable at that size rather than blowing out the page, but don't
  over-build (no virtualization library, this is a rare-path form).

### Definition of Done
- [ ] Default (no overrides) completion behaves identically to today — verify with a
      regression check, not just new-path testing
- [ ] `slabOverrides` sequence validation rejects out-of-range/duplicate sequences with 400
- [ ] Generated slabs use per-sequence override values when present, session defaults otherwise
- [ ] Frontend toggle defaults off; per-slab rows only appear when explicitly enabled
- [ ] `tsc --noEmit` clean (both backend and frontend), `npm run build` clean
- [ ] `handoff/REVIEW-REQUEST.md` written in this worktree

---

## Builder Plan
*Builder adds their plan here before building. Architect reviews and approves.*

### Backend — `cutting-session.service.ts`
1. `CompleteSessionInput` (~line 34-43): add
   `slabOverrides?: { sequence: number; lengthFt?: number; widthFt?: number; thicknessMm?: number }[];`
   after `thicknessMm`.
2. In `complete()`, right after the existing `finalGoodSlabCount > totalSlabsCut` check
   (~line 128-130), add validation (only runs when `slabOverrides` is provided/non-empty):
   - every `sequence` is an integer
   - every `sequence` is within `1..finalGoodSlabCount` inclusive
   - no duplicate `sequence` values
   - throw `BadRequestException` with a descriptive message otherwise, matching the file's
     existing one-liner style.
3. Build a `Map<number, override>` from `input.slabOverrides` (empty map if undefined) once,
   before/at the top of the `$transaction` callback — cheap, avoids `.find()` inside the loop.
4. In the generation loop (~line 166-181), look up `overridesByseq.get(seq)` and resolve each of
   `lengthFt`/`widthFt`/`thicknessMm` as `override?.field ?? input.field` (same fallback chain as
   today, just with the override spliced in front). No change to `thicknessMm`'s final
   `?? 18.0` default — that stays as the last fallback either way, so a slab whose override
   leaves `thicknessMm` unset AND whose session-level `input.thicknessMm` is also unset still
   lands on 18.0, unchanged from today.
5. No controller change needed — `session.controllers.ts`'s `complete()` endpoint takes
   `body: any` and passes it straight through; the new field flows through untouched.

### Frontend — `app/dpr/page.tsx`
1. New state: `slabOverridesEnabled: Record<string, boolean>` (per session, default absent/false)
   and `slabOverrideRows: Record<string, Record<number, { lengthFt?: string; widthFt?: string;
   thicknessMm?: string }>>` (per session, per sequence, only populated for rows the supervisor
   actually edits).
2. Toggle checkbox rendered inside the existing "Complete Cutting" block (~line 252 area, next to
   the dimension fields), only when `completionForm[s.id]?.finalGoodSlabCount` parses to a valid
   integer > 0. Label: "different sizes for some slabs?". Unchecked by default — matches brief's
   "pixel-identical when off" requirement, since the per-slab UI simply doesn't render.
3. When checked, render one `.row-card`/`.row-grid` row (reusing the pattern already used in
   `sales/page.tsx`) per `seq` in `1..finalGoodSlabCount`, in a wrapper `div` with
   `maxHeight`/`overflowY: auto` inline style (brief explicitly allows inline, no virtualization
   needed) so a 47-row list stays scrollable instead of blowing out the page. Each row shows the
   sequence number and three inputs (length/width/thickness), value falls back to the
   session-level default (`completionForm[s.id]?.lengthFt` etc.) for display when the row hasn't
   been touched — i.e. genuinely pre-filled, not blank.
4. `submitCompletion`: if `slabOverridesEnabled[s.id]` is true, build the `slabOverrides` array by
   iterating `1..finalGoodSlabCount`; for each seq, compare the row's three field values (falling
   back to session default when the row itself has no entry) against the session-level default
   value; include a `{ sequence, ...onlyTheFieldsThatDiffer }` entry only if at least one field
   differs after parsing. Rows that end up identical to the session default are omitted entirely
   (keeps payload small, matches "99% uniform" framing). If toggle is off, `slabOverrides` is
   simply not included in the request body — identical to today's shape.
5. No change to the existing single-set dimension inputs (~line 259-267) — they remain the
   session-level defaults and are always sent as `lengthFt`/`widthFt`/`thicknessMm` exactly as
   today, overrides are additive only.

### Verification approach (no live DB)
- Trace `complete()` by hand for the default path (`slabOverrides` undefined) to confirm the
  Map is empty, `overridesByseq.get(seq)` is always `undefined`, and every slab's dimension
  resolution collapses to exactly `input.field` / `?? 18.0` — byte-for-byte the current logic.
- Trace one mixed-size example (e.g. finalGoodSlabCount=5, override on seq 3 with only
  `lengthFt` set) to confirm seq 3 gets the overridden length but session-default width/
  thickness, and seq 1,2,4,5 get pure session defaults.
- Trace the validation branch with an out-of-range sequence (e.g. 0, or > finalGoodSlabCount)
  and a duplicate sequence to confirm both 400 before the transaction opens.
- `tsc --noEmit` and `npm run build` in both packages as the objective correctness gate for
  types or accidental syntax errors.

### Open questions / none blocking
- None — brief is unambiguous on both backend and frontend shape. Proceeding without waiting
  for a reply per this run's instructions.
