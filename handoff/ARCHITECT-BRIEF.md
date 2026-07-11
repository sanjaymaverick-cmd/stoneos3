# Architect Brief
*Written by Architect. Read by Builder and Reviewer.*
*Overwrite this file each step — it is not a log, it is the current active brief.*

---

## Step 4 — Owner/Admin role-based dashboard

Frontend only. No backend changes, no new endpoints — everything below is buildable from
existing GET endpoints. `packages/frontend/app/dashboard/page.tsx` is currently a literal
placeholder (`TODO — role-based dashboard shell`) — this step fills it in for the owner/admin
role only. Other roles keep seeing today's placeholder unchanged — do not build views for
other roles this step (scope decision, Owner-confirmed: owner/admin first, others later).

### Visual direction (Owner-confirmed)
REFINE the existing "quarry ledger" identity — do not re-skin. Reuse `app/globals.css`'s
existing classes (`.ticket`, `.stamp`, `.badge`, `.mini-btn`, `.list-table`, `.mono`, the
brass/stone/graphite palette, Space Grotesk + IBM Plex Mono) so the dashboard looks like it
belongs with `/sales`/`/expenses`, not like a bolted-on new design system. New CSS is fine
where needed (e.g. a stat-card class for KPI numbers) but must extend the existing palette/
fonts, not introduce new ones. Light, functional micro-interactions are welcome (e.g. a fade-in
on load, a subtle hover on stat cards) — skip anything decorative that doesn't communicate
state. Do not touch the visual design of any OTHER existing page in this step.

### Role detection
No `useRole()` hook exists yet — every page currently re-reads `user?.publicMetadata?.role`
inline (see `AppNav.tsx`). Add one reusable hook (e.g. `packages/frontend/lib/useRole.ts`,
your call on exact location matching this codebase's `lib/` conventions) since this is now the
second place needing it — return the role string (or `undefined` while Clerk is still
loading). Use it in `dashboard/page.tsx` to branch: owner/admin → the widgets below;
everything else → the existing placeholder message, unchanged.

### Widgets (all from existing endpoints — verify exact response shapes yourself before
building, don't assume field names)
1. **Sales summary, trailing 30 days** — `GET /daily-sales-summary?from&to` (from = today-30,
   to = today). Sum `totalQtySqft`, `invoicedAmount`, `actualAmountReceived` across the range.
   Show as 3 stat numbers.
2. **Expense summary, trailing 30 days** — `GET /expenses?from&to`, same range. Total amount,
   plus a small breakdown by `category` (top 4-5 categories by sum is enough — don't build a
   chart library integration, a simple sorted list/mini-bar with existing CSS is fine).
3. **What's on the machines right now** — `GET /cutting-sessions/active` (already filters to
   `status: "in_progress"`, includes `rawBlock` + `dayLogs`). One card per active session:
   block serial number, variety, days running (`startedAt` to now). Empty state if none active.
4. **Raw block stock snapshot** — `GET /raw-blocks`, group client-side by `currentStatus`, show
   as counts (e.g. "12 in stock, 2 in cutting, 5 polished, 30 sold").
5. **Recent activity** — small combined list: last 5 sales orders (`GET /sales-orders`, sort by
   `orderDate` desc, slice) and last 5 expenses (`GET /expenses`, sort by `expenseDate` desc,
   slice) — two short lists side by side or stacked, your call on layout, matching `.list-table`
   styling.

### Build pattern (match existing pages exactly — see `sales/page.tsx`, `expenses/page.tsx`)
- `"use client"`, `useAuth()` from `@clerk/nextjs`, `apiFetch`/`safeGetToken` from
  `lib/api.ts` — do not introduce a new fetch pattern, no SWR/React Query.
- `useEffect(() => { load() }, [])` on mount, `safeGetToken` (not raw `getToken`) for reads.
- No shared data-fetching hook exists in this codebase yet — don't add one for this step either
  (each widget's `load()` can call multiple endpoints in the same effect); that's a bigger
  refactor out of scope here.
- `/expenses` and `/sales-orders` have no server-side date filtering in current frontend usage
  (expenses supports `?from&to` server-side, sales-orders doesn't) — for widget 5 (recent
  activity) just fetch unfiltered and slice/sort client-side, matching how `expenses/page.tsx`
  already computes totals client-side today.

### Flags
- Don't build the recovery-ratio report or any new backend aggregate endpoint this step — if a
  widget above turns out to need one you didn't expect, stop and flag it in the review request
  rather than building backend changes unbriefed.
- Don't build role views for accountant/manager/supervisor/operator/auditor this step — those
  come later, one at a time, per Owner's explicit "Owner/Admin first" scope decision.
- `MachineRuntimeLog` has no GET endpoint (write-only) — don't attempt a "machine runtime
  today" widget, it's not buildable without new backend work (logged as a future Known Gap,
  not this step).
- `GET /dpr` only takes a single `date`, not a range — don't attempt a DPR trend widget this
  step for the same reason.

### Definition of Done
- [ ] `useRole()` hook added and used to branch the dashboard by role
- [ ] Owner/admin see all 5 widgets populated from real local Postgres data (or correct empty
      states if data is sparse — `raw_block` is currently empty locally, so widgets 3/4 will
      legitimately show empty/zero, that's correct behavior not a bug)
- [ ] Non-owner/admin roles see today's unchanged placeholder
- [ ] Visual style matches existing pages (reuses `globals.css` classes/palette/fonts, no new
      design system introduced)
- [ ] No backend files touched
- [ ] `handoff/REVIEW-REQUEST.md` written

---

## Builder Plan
*Builder adds their plan here before building. Architect reviews and approves.*

Brief confirmed complete and unambiguous — verified all 5 endpoints' actual response shapes
against the backend before writing code (not assumed):
- `GET /daily-sales-summary?from&to` → array of `{summaryDate, totalQtySqft, invoicedAmount,
  actualAmountReceived, isDerived}` (Decimal fields serialize as strings, need `Number()`).
- `GET /expenses?from&to` → array of `{category, amount, expenseDate, vehicleId, vehicle,
  toWhom, allocations}`, `include: vehicle`, ordered `expenseDate desc` server-side already.
- `GET /cutting-sessions/active` → array of `{..., rawBlock: {serialNumber, varietyName, ...},
  startedAt, dayLogs}`, pre-filtered to `status: "in_progress"`.
- `GET /raw-blocks` → array of `{..., currentStatus, serialNumber, varietyName}`. Real
  `currentStatus` values in this codebase today are `in_stock` / `under_cutting` / `cut`
  (verified via grep of every write site) — not the brief's illustrative "polished"/"sold"
  labels (those are `Slab.salesStatus`, a different model). Grouping by whatever
  `currentStatus` values actually occur, label-formatted, rather than hardcoding a status list.
- `GET /sales-orders` → array of `{orderDate, customer: {name}, lineItems}`, ordered
  `orderDate desc` server-side already, no date filter support (per brief).

Plan: add `packages/frontend/lib/useRole.ts` (wraps Clerk's `useUser()`, returns role string or
`undefined` while `!isLoaded`). Rewrite `dashboard/page.tsx` to branch on it — owner/admin get a
new `load()` effect firing all 5 endpoint calls via `Promise.all`, non-owner/admin keep today's
placeholder verbatim. Reuse the `Ticket` component (already extracted, used by `admin/users`)
instead of hand-rolling ticket markup. Add a `stat-card`/`stat-number`/`stat-label` class group
plus a small `mini-bar` class for the expense category breakdown to `globals.css`, extending the
existing palette (no new colors/fonts). No backend files touched. Proceeding to build.
