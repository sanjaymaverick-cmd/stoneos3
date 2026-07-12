# Architect Brief
*Written by Architect. Read by Builder and Reviewer.*
*Overwrite this file each step — it is not a log, it is the current active brief.*

---

## Step 5A — Recovery ratio report (README #4)

You are working in an isolated git worktree on branch `feat/recovery-ratio-report`. This is
running in parallel with three other independent steps (each in their own worktree) — do not
assume anything about their state, do not touch files outside what this brief describes.

### What this is
`RawBlock` in `packages/backend/prisma/schema.prisma` (see the comment block right above
`model RawBlock`, ~line 247) documents a recovery-ratio metric that was never built as a live
report:

> actual sqft sold (sum of `SalesLineItem.quantity` across all slabs where `parentBlockId` =
> this block) divided by `weightTons`. Benchmark: 105 sqft per ton of rough block. Below 105 =
> below-target yield; above 105 = good efficiency. Must use SALE-TIME sqft only — never
> `Slab.lengthFt`/`widthFt`, which are provisional production-stage placeholders.

Build this as a real, live-computed report. No new schema/migration needed — everything it
needs already exists (`RawBlock.weightTons`, `Slab.parentBlockId`, `SalesLineItem.quantity`
joined via `SalesLineItem.slabId → Slab.id`).

### Backend
Add to `packages/backend/src/modules/inventory/raw-block.service.ts` and
`raw-block.controller.ts` (follow the existing `computeDamagedSlabLoss` pattern in the same
service file for style — private helper + a controller route that calls it):

- New method, e.g. `findRecoveryRatios(factoryId: string)`, returns every `RawBlock` for the
  factory with a computed object per block:
  - `soldSqft` — sum of `SalesLineItem.quantity` across all `SalesLineItem` rows whose `slab`
    has `parentBlockId = block.id`. Use a Prisma query that joins through `Slab` (e.g.
    `slab.findMany({ where: { parentBlockId }, include: { salesLines: true } })` and sum
    client-side, or an aggregate — your call, match the `Number(x)` Decimal-to-number
    conversion pattern already used elsewhere in this file, no `.toNumber()`).
  - `recoveryRatio` — `soldSqft / weightTons`, `null` if `weightTons` is null or 0, or if
    `soldSqft` is 0 (a block with nothing sold yet has no ratio to report, not a ratio of 0).
  - `benchmark: 105`, `belowBenchmark: boolean | null` (`null` when `recoveryRatio` is null).
- New route: `GET /raw-blocks/recovery-ratio` — **must be declared BEFORE the existing
  `GET(":id")` route** in the controller, or Nest will match `/raw-blocks/recovery-ratio` as
  `GET(":id")` with `id = "recovery-ratio"` and it will silently 404/error against Prisma
  instead of hitting your new handler. This is the one thing in this brief most likely to bite
  you — double check route order after adding it.
- Scope to `user.factoryId` exactly like every other query in this file (multi-tenant
  enforcement — no exceptions, see README's "Multi-tenant enforcement" section).

### Frontend
Add a new page, e.g. `packages/frontend/app/reports/recovery-ratio/page.tsx`. Follow the
existing build pattern exactly (see `sales/page.tsx`/`expenses/page.tsx`): `"use client"`,
`useAuth()` + `apiFetch`/`safeGetToken` from `lib/api.ts`, `useEffect` on mount, no new fetch
library. Reuse existing `globals.css` classes (`.ticket`, `.list-table`, `.badge`, `.mono`,
the brass/stone/graphite palette) — do not introduce new colors/fonts. A simple table (block
serial, variety, weight tons, sold sqft, recovery ratio, a badge/color cue for below-benchmark)
is enough — no charting library. Add a nav link in `components/AppNav.tsx` (this page is not
role-restricted — any authenticated user can view it, unlike `/admin/users`).

Local Postgres currently has an empty `raw_block` table — the page should render a correct
empty state, not an error. That's expected, not a bug (same situation Step 4 hit).

### Flags
- Do not touch `packages/backend/prisma/schema.prisma` — nothing here needs a new column.
- Do not build any date-range filtering for this report — it's a point-in-time snapshot across
  all blocks, matching the metric's own definition (lifetime sold sqft per block, not
  sold-in-period).
- Do not change `computeDamagedSlabLoss` or anything else already on `GET /raw-blocks/:id` —
  this is a separate, additive endpoint.
- If you find `SalesLineItem.slabId` can be null in ways that break the join (e.g. line items
  not tied to a specific slab), handle gracefully (`null` slabId rows simply don't contribute
  to any block's `soldSqft`) rather than crashing — don't over-engineer beyond that.

### Definition of Done
- [ ] `GET /raw-blocks/recovery-ratio` returns every block in the caller's factory with
      `soldSqft`, `recoveryRatio` (or `null`), `benchmark: 105`, `belowBenchmark`
- [ ] Route ordering verified — `recovery-ratio` does not get swallowed by `:id`
- [ ] Frontend page renders the table (or correct empty state), styled consistent with existing
      pages, linked from `AppNav.tsx`
- [ ] Multi-tenant scoping confirmed (query filters on `factoryId`, no global list anywhere)
- [ ] `tsc --noEmit` clean (both backend and frontend), `npm run build` clean
- [ ] `handoff/REVIEW-REQUEST.md` written in this worktree

---

## Builder Plan
*Builder adds their plan here before building. Architect reviews and approves.*

**What I verified in schema/existing code before writing anything:**
- `RawBlock.weightTons` is `Decimal? @db.Decimal(10,3)` — nullable, needs `Number(x)` conversion.
- `Slab.parentBlockId` is required (non-null), and `RawBlock.slabs` (`Slab[]`) is already an established
  relation used in `findOne` (`include: { slabs: true }`).
- `SalesLineItem.slabId` is `String? @map("slab_id")`, relation `slab Slab? @relation(...)`, and `Slab.salesLines`
  is the inverse (`SalesLineItem[]`). Because I navigate `block → slabs → salesLines` (not a raw
  `salesLineItem.findMany` scanning all line items), a `SalesLineItem` with `slabId = null` is structurally
  invisible from this path — it can never be the inverse relation of any slab. So the "handle null slabId
  gracefully" flag in the brief is satisfied by the query shape itself, no extra filtering needed.
- `SalesLineItem.quantity` is `Decimal @db.Decimal(10,2)` — the sale-time sqft figure per line, per the schema
  comment on `Slab.lengthFt`/`widthFt` (never using those fields, per the brief).
- Confirmed `computeDamagedSlabLoss` pattern in `raw-block.service.ts`: private helper taking a narrow inline
  type, `Number(x)` conversions, no `.toNumber()`. I'm following the same shape for a new
  `computeRecoveryRatio` helper.
- One deliberate deviation from `computeDamagedSlabLoss`'s pattern: that helper's result is nested under a
  `damagedSlabLoss` key on the response. The brief's Definition of Done lists `soldSqft`, `recoveryRatio`,
  `benchmark`, `belowBenchmark` as fields directly on each returned block object (not nested), so
  `findRecoveryRatios` will flatten the computed fields onto each block instead of nesting them.
- Confirmed controller route-ordering pitfall is real risk here: `@Get(":id")` is declared right after
  `@Get()` in the existing controller. Will add `@Get("recovery-ratio")` immediately after `@Get()` and before
  `@Get(":id")`.
- Frontend: confirmed `lib/api.ts` exports `apiFetch(path, token, options?)` and
  `safeGetToken(getToken)`; confirmed `sales/page.tsx`/`expenses/page.tsx` load pattern (`useEffect` calling an
  async `loadX` that calls `safeGetToken` then `apiFetch`, early-return if no token). New page is read-only
  (no form/submit), so it's a simplified version of that pattern — just the load + table.
- Confirmed `globals.css` badge classes: `.badge.invoiced` (moss/green), `.badge.cash` (rust/red),
  `.badge.mixed` (brass/amber). Reusing these (not adding new classes) for the status cue: `invoiced` =
  on/above benchmark, `cash` = below benchmark, `mixed` = no sales yet (`recoveryRatio === null`). This is a
  semantic reuse (colors already carry the right connotation — green good / red bad / amber neutral) rather
  than introducing new CSS, per the brief's constraint.
- Confirmed `AppNav.tsx`'s `LINKS` array is unconditional (role-restricted `/admin/users` is appended
  conditionally afterward) — will add the new link directly to `LINKS` since this page isn't role-restricted.

**What I'm building:**
- Backend: `RawBlockService.findRecoveryRatios(factoryId)` — `rawBlock.findMany({ where: { factoryId },
  include: { slabs: { include: { salesLines: true } } } })`, then map each block through a new private
  `computeRecoveryRatio({ weightTons, slabs })` helper returning `{ soldSqft, recoveryRatio, benchmark: 105,
  belowBenchmark }`, spread flat onto the block (with the raw `slabs` include stripped out of the response —
  no reason to ship the nested slab/salesLine payload to the client when only the aggregate is needed).
- `belowBenchmark = recoveryRatio == null ? null : recoveryRatio < 105`.
- `recoveryRatio = (weightTons != null && weightTons > 0 && soldSqft > 0) ? soldSqft / weightTons : null`.
- Controller: `@Get("recovery-ratio")` before `@Get(":id")`, scoped to `user.factoryId`, no body/params.
- Frontend: `app/reports/recovery-ratio/page.tsx`, `"use client"`, table with columns Serial / Variety /
  Weight (t) / Sold Sqft / Recovery Ratio / Status, badge per row, plain-text empty state when the factory has
  no raw blocks (matches Step 4's precedent of an empty-table state being correct, not a bug, against the
  current empty local `raw_block` table).
- Nav link `{ href: "/reports/recovery-ratio", label: "Recovery Ratio" }` added to `AppNav.tsx`'s `LINKS`.

**Uncertain / judgment calls (proceeding, flagging for review rather than blocking):**
- Route path chosen as `/reports/recovery-ratio` on the frontend (brief says "e.g." so this is a suggestion,
  not a mandate) — matches the existing `/dpr`, `/polishing`, `/sales`, `/expenses` flat-namespace convention
  more loosely since it's nested under `/reports/`, but there's no existing `/reports/*` precedent in this
  codebase to confirm against. Going with the brief's literal example path since nothing contradicts it.
- No existing plain "empty state" CSS pattern found in `globals.css` (no `.empty-state` class) — using an
  inline-styled `<div>` with the same muted color (`#857c6c`) already used for `.ticket-subtitle`, rather than
  inventing a new class, to stay within "reuse existing classes/colors" while still not leaving a bare empty
  `<table>` with no explanation.
