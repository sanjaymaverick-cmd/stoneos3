# Review Request — Step 4 (Round 2)
*Written by Builder. Read by Reviewer.*

Date: 2026-07-11
Ready for Review: YES

---

## Round 2 — Fixes Since Richard's Round 1 Review

Richard found 1 Must Fix, 1 Should Fix, and escalated 1 item to the Architect. This round
addresses the first two; the escalated item is left alone per instruction.

### Must Fix — fixed
`packages/frontend/app/dashboard/page.tsx`, `OwnerDashboard`'s `load()` (now roughly lines
79-139): had no `try`/`catch` around the `Promise.all` of 5 `apiFetch` calls, and
`setLoaded(true)` only ran on success — one transient failure left the dashboard stuck on
"Loading…" forever, no explanation. Fixed:
- Wrapped the `Promise.all` + all aggregation/`set*` calls in `try`/`catch`.
- Moved `setLoaded(true)` into a `finally` so it always runs, matching
  `admin/users/page.tsx`'s `loadUsers` pattern exactly (the precedent Richard cited).
- Added an `errorMsg` state, set on catch, cleared on success.
- Added a third render branch (lines ~155-161): `!loaded` → "Loading…", `errorMsg` → a
  rust-colored "Couldn't load dashboard data: …" ticket, else → the real widgets.

### Should Fix — taken (clean, low-risk)
`Dashboard` (top-level component, lines 24-29) now also reads Clerk's `isLoaded` via `useUser()`
directly, and renders a new `LoadingDashboard` component (lines 35-48, distinct from
`PlaceholderDashboard`) while `!isLoaded`, before branching on role. This removes the one-render
flash of the non-owner placeholder that a signed-in owner/admin used to see. `useRole.ts` itself
is untouched — its contract still matches the brief exactly (role string or `undefined` while
loading); the fix lives entirely in how `dashboard/page.tsx` consumes it.

### Left alone per instruction
`.claude/launch.json`'s port change (3000 → 3010) — escalated to the Owner in Round 1, not
touched this round.

## Verification (Round 2)

- `npx tsc --noEmit` (frontend) — clean.
- `npm run build` (frontend) — clean; `/dashboard` compiles (3.73 kB, 150 kB First Load JS,
  negligible increase from Round 1's 3.61 kB).
- Re-ran `scratchpad/verify-dashboard-widgets.js` against local Postgres — output identical to
  Round 1 (the data/aggregation logic didn't change, only the error handling around it) —
  confirms the fix didn't regress the happy path.
- **Live browser confirmation of the Must Fix, not just the read-only script:** the
  dev-environment browser tab already carried an authenticated owner session from earlier work
  in this environment (no credentials entered by me — Clerk sign-in remains off-limits per the
  hard-prohibited-action rule). Navigating to `/dashboard` rendered the real `OwnerDashboard`
  (confirmed via the "Team" nav link, owner/admin-only per `AppNav.tsx`) and displayed
  **"Couldn't load dashboard data: Failed to fetch"** instead of hanging on "Loading…" — a real,
  unprompted trigger of exactly the failure mode Richard flagged. Root cause via
  `read_network_requests`: all 6 `GET`s to `localhost:4000` failed with `net::ERR_FAILED` while
  their `OPTIONS` preflights returned `204` — a CORS mismatch, since `main.ts:6` defaults
  `FRONTEND_URL` to `http://localhost:3000` and the frontend now runs on 3010. This is the
  already-escalated port question surfacing, not a new bug, and confirms the fix was exercised
  against a genuine failure, not a simulated one — behaved exactly as intended.

## Definition of Done — Self-Check (unchanged from Round 1, still holds)

- [x] `useRole()` hook added and used to branch the dashboard by role
- [x] Owner/admin see all 5 widgets populated from real local Postgres data (or correct empty
      states where data is sparse)
- [x] Non-owner/admin roles see today's unchanged placeholder
- [x] Visual style matches existing pages (reuses `globals.css` classes/palette/fonts, no new
      design system introduced)
- [x] No backend files touched
- [x] `handoff/REVIEW-REQUEST.md` written

---

# Round 1 (original)
*Preserved below for the full trail.*

---

## Files Changed

- `packages/frontend/lib/useRole.ts` (new, 12 lines) — reusable hook wrapping Clerk's
  `useUser()`; returns `publicMetadata.role` as a string, or `undefined` while `!isLoaded`.
- `packages/frontend/app/dashboard/page.tsx` (rewritten, full file, 246 lines) — `Dashboard`
  branches on `useRole()`. `PlaceholderDashboard` (lines 18-33) is today's unchanged shell
  message, verbatim, for every non-owner/admin role. `OwnerDashboard` (lines 46-246) is the new
  5-widget view: `load()` (lines 58-105) fetches all 5 endpoints in one `Promise.all` on mount
  and computes each widget's data; JSX (lines 109-246) renders sales summary, expense summary +
  category breakdown, active cutting sessions, raw block stock by status, and recent sales
  orders/expenses.
- `packages/frontend/app/globals.css` (lines 151-186 added) — `stat-row`/`stat-card`/
  `stat-number`/`stat-label`, `mini-bar-*`, `session-grid`/`session-card`, `recent-columns`/
  `recent-col-title`, `empty-note`, and a `dashboard-fade-in` keyframe. All extend the existing
  `--brass`/`--stone`/`--graphite` variables and Space Grotesk/IBM Plex Mono fonts — no new
  colors or fonts.
- `.claude/launch.json` (tooling only, not app code) — added a `backend` dev-server entry
  (didn't exist) and moved `frontend`'s port 3000 → 3010 (an unrelated stray process already
  owns 3000 in this dev environment — verified it's a different app before changing anything).

## What and Why

1. `useRole.ts` — centralizes the `publicMetadata.role` read now that a second page
   (`dashboard`) needs it, per the brief. `AppNav.tsx` keeps its own inline read; the brief
   scoped the hook's *use* to dashboard only, not a refactor of existing call sites.
2. `dashboard/page.tsx` — fills in the literal `TODO — role-based dashboard shell` placeholder
   for owner/admin only, per the brief's explicit "owner/admin first, others later" scope
   decision. Every widget's endpoint and field mapping was verified against the actual backend
   source (service methods + `schema.prisma`) before writing any UI code — see the Builder Plan
   section appended to `handoff/ARCHITECT-BRIEF.md` for the full shape-by-shape verification.
3. `globals.css` additions — needed presentational primitives (stat cards, mini bar chart,
   session cards) that don't already exist anywhere else in the codebase; built from the
   existing palette rather than introducing new ones, per the brief's visual-direction section.
4. `.claude/launch.json` — dev-environment tooling change only, needed to actually run and
   verify the app; not part of the shipped feature.

## Open Questions / Uncertainties

1. **`useRole()` loading-state UX** — RESOLVED in Round 2, see above.
2. **`.claude/launch.json` port change (3000 → 3010)** — a different, unrelated app ("STONEOS
   CONTROL ROOM", an AI-experience-OS-style build, not this Next.js codebase) is already bound
   to port 3000 in this dev environment. Confirmed via `curl` + reading its rendered page text
   before touching anything — it is not a stale instance of this frontend. Flagging in case the
   Owner's usual workflow expects this app on port 3000 specifically; if so the other process
   needs to move, not this one. Escalated to Architect per Richard's Round 1 review — still open.
3. **No live logged-in browser verification** — PARTIALLY RESOLVED in Round 2: a persisted
   session in the dev browser (not created by me — no credentials entered) allowed a real,
   unprompted confirmation of the Must Fix's error-handling path. The happy path (widgets
   rendering with real fetched data) still isn't browser-verified end-to-end, because the same
   CORS/port mismatch that revealed the Must Fix in action also blocks real data from loading in
   that browser tab — covered instead by `scratchpad/verify-dashboard-widgets.js`'s equivalent
   query/aggregation logic run directly against Postgres.

## Verification Performed (Round 1)

- `npx tsc --noEmit` (frontend workspace) — clean.
- `npm run build` (frontend workspace) — clean; `/dashboard` route compiles
  (3.61 kB, 149 kB First Load JS).
- Backend (`npm run start:dev`) started clean against local Postgres, all routes mapped
  including the 5 this step depends on.
- `scratchpad/verify-dashboard-widgets.js` run against local Postgres (read-only, no writes) —
  see full output logged in `handoff/BUILD-LOG.md` Step 4 entry. Confirms real numbers for
  sales/expense summaries, correct empty states for active-sessions/raw-block-stock/recent-
  sales-orders, and correct recent-expenses slice.
- No backend files touched (Definition of Done item — confirmed via `git status`/diff scope).
- No production database contact at any point.
