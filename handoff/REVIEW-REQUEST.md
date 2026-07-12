# Review Request — Step 5A (Recovery ratio report)
*Written by Builder. Read by Reviewer.*

Date: 2026-07-12
Worktree: `worktrees/recovery-ratio-report`, branch `feat/recovery-ratio-report`
Ready for Review: YES

---

## Files Changed

- `packages/backend/src/modules/inventory/raw-block.service.ts` (new code appended after
  `computeDamagedSlabLoss`, roughly lines 108-138) — new public `findRecoveryRatios(factoryId)`
  method and private `computeRecoveryRatio(block)` helper.
- `packages/backend/src/modules/inventory/raw-block.controller.ts` (lines 18-23) — new
  `GET /raw-blocks/recovery-ratio` route, declared immediately after `@Get()` and before
  `@Get(":id")`.
- `packages/frontend/app/reports/recovery-ratio/page.tsx` (new file, 84 lines) — read-only
  report page.
- `packages/frontend/components/AppNav.tsx` (1 line added to the `LINKS` array) — nav entry
  for the new page.

## What and Why

1. **`findRecoveryRatios`** — fetches every `RawBlock` for `factoryId` with
   `slabs: { include: { salesLines: true } }`, then maps each block through
   `computeRecoveryRatio`, stripping the raw `slabs` include out of the response and
   flattening `soldSqft`/`recoveryRatio`/`benchmark`/`belowBenchmark` onto each block object —
   this is what the client actually needs, per the Definition of Done wording, rather than
   shipping the full nested slab/sales-line payload.
2. **`computeRecoveryRatio`** — sums `Number(line.quantity)` across every `salesLine` of every
   `slab` on the block for `soldSqft`; `recoveryRatio = soldSqft / weightTons` only when
   `weightTons` is a positive number AND `soldSqft > 0` (otherwise `null` — a block with
   nothing sold yet has no ratio to report, not a ratio of 0, per the brief); `benchmark` is a
   fixed `105`; `belowBenchmark` is `recoveryRatio < 105` or `null` in lockstep with
   `recoveryRatio`.
3. **Controller route ordering** — `recovery-ratio` is declared before `:id` specifically to
   avoid Nest matching it as `GET(":id")` with `id = "recovery-ratio"`, which the brief flagged
   as the most likely mistake in this step. Verified by inspection (route decorators are
   evaluated in declaration order in Nest) rather than a live server, since no DB is reachable
   in this worktree.
4. **Frontend page** — follows the `sales/page.tsx`/`expenses/page.tsx` pattern
   (`"use client"`, `useAuth()` + `apiFetch`/`safeGetToken`, `useEffect` on mount) but is
   read-only (no form), so it's just a load + table. Table columns: Serial, Variety, Weight (t),
   Sold Sqft, Recovery Ratio, Status. Status column reuses existing `.badge` classes
   semantically rather than adding new CSS: `.badge.invoiced` (moss/green) = on-or-above
   benchmark, `.badge.cash` (rust/red) = below benchmark, `.badge.mixed` (brass/amber) = no
   sales yet (`recoveryRatio === null`).
5. **`AppNav.tsx`** — added `{ href: "/reports/recovery-ratio", label: "Recovery Ratio" }` to
   the unconditional `LINKS` array (this page is not role-restricted, unlike `/admin/users`).

## Open Questions / Uncertainties

1. **Route path naming** — used `/reports/recovery-ratio` (frontend) and
   `GET /raw-blocks/recovery-ratio` (backend), both taken directly from the brief's own "e.g."
   examples. There's no existing `/reports/*` namespace precedent elsewhere in the codebase to
   confirm the frontend path convention against (every other page is flat: `/sales`,
   `/expenses`, `/dpr`). Flagging in case Richard/Arch want it flattened to `/recovery-ratio`
   instead for consistency — low-risk either way, one-line change if so.
2. **No `.empty-state` CSS class exists** in `globals.css` — used an inline-styled `<div>`
   (`color: #857c6c`, matching `.ticket-subtitle`'s existing muted color, `font-family: IBM Plex
   Mono` matching the rest of the mono numerals) for the "No raw blocks recorded yet." message
   rather than inventing a new class, to stay within "reuse existing colors/fonts."
3. **Not live-verified against a real empty `raw_block` table in a browser** — this worktree has
   no reachable local Postgres per the build instructions, so the empty-state render path was
   verified by reading the code (unconditional `blocks.map(...)` over an empty array renders
   zero `<tr>`s, `loaded && blocks.length === 0` then shows the message) rather than by loading
   the page against the real (currently-empty) `raw_block` table. The brief confirms this is the
   expected state (same situation Step 4 hit), not something to work around.

## Verification Performed

- `npm install` from the worktree root — clean (466 packages; this fresh worktree had no
  `node_modules` yet).
- `npx prisma generate` (backend) — required once, before `tsc`/`build` would type-check
  cleanly; the fresh worktree's Prisma Client wasn't pre-generated. Unrelated to this step's
  actual code changes, just a fresh-checkout prerequisite.
- `npx tsc --noEmit` — clean in `packages/backend` and clean in `packages/frontend`.
- `npm run build` — clean in `packages/backend` (`nest build`, no output/errors) and clean in
  `packages/frontend` (`next build`); build output shows `/reports/recovery-ratio` as a
  generated static route (1.71 kB, 148 kB First Load JS).
- No database connection attempted at any point — per instruction, this worktree does not have
  a reachable local Postgres and there is no production database for this project. Correctness
  of the join/aggregation logic was reasoned through by reading `schema.prisma`'s
  `SalesLineItem`/`Slab`/`RawBlock` models directly (confirmed `SalesLineItem.slabId` is
  nullable, `Slab.salesLines` is its correctly-scoped inverse relation, `Slab.parentBlockId` is
  non-null) rather than a live smoke test.

## Definition of Done — Self-Check

- [x] `GET /raw-blocks/recovery-ratio` returns every block in the caller's factory with
      `soldSqft`, `recoveryRatio` (or `null`), `benchmark: 105`, `belowBenchmark`
- [x] Route ordering verified — `recovery-ratio` declared before `:id` in the controller
- [x] Frontend page renders the table (or correct empty state), styled consistent with existing
      pages, linked from `AppNav.tsx`
- [x] Multi-tenant scoping confirmed — `findRecoveryRatios` filters `rawBlock.findMany` on
      `factoryId` exactly like `findAll`/`findOne`; no global/unscoped query anywhere in the
      new code
- [x] `tsc --noEmit` clean (both backend and frontend), `npm run build` clean (both)
- [x] `handoff/REVIEW-REQUEST.md` written in this worktree
