# Session Checkpoint — 2026-07-11
*Read this before reading anything else. If it covers current state, skip BUILD-LOG.*

---

## Where We Stopped

Steps 1 (historical backfill), 2 (RawBlock opening-balance/entry-provenance), 3 (damaged-slab
cost allocation on `GET /raw-blocks/:id`), and 4 (owner/admin role-based dashboard) are all
built, reviewed clean by Richard, committed, and pushed. README items 1 (bootstrap), 2, 3, 7,
8 (superseded), 9 are all closed out. Dashboard is no longer a placeholder for owner/admin —
verified live in a real browser, not just scripts.

Remaining open items:
- README #4 (recovery ratio report), #5 (per-slab dimension overrides), #6 (item-level Tally
  detail) — none started.
- Role-based dashboard views for accountant/manager/supervisor/operator/auditor — owner/admin
  was deliberately scoped first (Step 4); others come later, one at a time, if wanted.
- Next.js major-version upgrade (15.5.20 → 16.2.10 latest) — explicitly deferred to its own
  future step with a full regression pass across every page; do not bundle it into unrelated
  work.

**Repo:** `origin` is `https://github.com/sanjaymaverick-cmd/stoneos3.git` (moved from the old,
now out-of-scope `sos.git` this session). Local `main` and `origin/main` are identical at
`543cd8a` — everything committed and pushed, nothing held back.

**Local Postgres state:** Step 1's backfilled data (2,421 Expense rows, 514 DailySalesSummary
rows), Step 2's schema migration applied, `raw_block` itself still empty (no real blocks
entered yet — Steps 2/3 only added capability). Bootstrap has been run for real: factory "Vedam
Granites" (`4485c4f7-...`) has B-21 + LPM machines seeded and `sanjay.maverick@gmail.com`
granted owner access — verified directly against Postgres.

**Local dev environment:** frontend dev server now runs on port **3010**, not 3000 (`.claude/
launch.json`) — port 3000 is occupied by an unrelated local app ("STONEOS CONTROL ROOM"),
confirmed with the Owner this is fine going forward. `packages/backend/.env`'s `FRONTEND_URL`
was updated to match (`http://localhost:3010`) — CORS will break again if these two drift out
of sync. Both dev servers need a restart (not just hot-reload) to pick up `.env` changes.

There is no production environment for this project — the old AWS deployment is explicitly out
of scope (see `project-stoneos-production-deploy-hold` memory), and historical-backfill
execution against any future real environment is the Owner's own manual responsibility (see
`project-backfill-manual-by-owner` memory), not the team's. Next action is whichever remaining
item the Project Owner wants to tackle — nothing is mid-flight.

---

## What Was Decided This Session

- Historical backfill scope: `Expense` + `DailySalesSummary` only — pre-go-live production
  session data (CuttingSession/PolishingSession) is permanently unrecoverable from the source
  data (KG-1).
- PAYMENTS column → `staff_salary`; OFFICIAL column's loan/bill lump sums → `loan_payment`
  (text-keyword split, not amount threshold).
- Tally exports cover FY 2025-26 for daybook detail, but the monthly/daily summary reports
  span 1 Apr 2022 → 1 Apr 2026 (verified via leap-year day-count cross-check) — only FY25-26
  has real data in them.
- One historical data-entry anomaly (2026-04-20, shifted columns) fixed: ₹50k → staff_salary
  for staff member Sandeep; ₹500k "WPPF" (partner profit payment) deliberately left unrecorded
  — not a business expense, no matching category.
- RawBlock opening-balance feature: `transfer_in` entry source removed entirely — **no
  cross-factory data access of any kind** until a proper multi-factory model is built at the
  login layer (Owner's explicit, standing decision — see
  `project-stoneos-no-cross-factory-access` memory).
- GitHub Actions deploy workflow disabled locally (`deploy.yml` → `deploy.yml.disabled`) —
  takes effect only once/if pushed.
- The old AWS deployment (`sos.git` remote, stoneos-db/ECS/ALB) is a prior learning exercise
  with no real business data — out of scope entirely going forward, not to be referenced or
  planned around (see `project-stoneos-production-deploy-hold` memory).
- Damaged-slab cost basis (Step 3): purchase price only (`actualAmountPaid` → `invoicedAmount`
  fallback), NOT purchase + allocated expenses — Owner's explicit choice for
  simplicity/availability over completeness.
- Repo moved to `https://github.com/sanjaymaverick-cmd/stoneos3.git`; all local commits pushed
  and confirmed matching `origin/main`.
- Historical-backfill execution against any future real environment is the Owner's own manual
  responsibility, not the team's (see `project-backfill-manual-by-owner` memory).
- `bootstrap.ts` fixed to reuse an existing factory (by name) instead of unconditionally
  creating one — needed because a factory row already existed with real backfilled data linked
  to it; running it unmodified would have created a duplicate and orphaned that data from the
  owner grant.
- UI/UX direction (Step 4 and beyond): REFINE the existing "quarry ledger" visual identity
  (brass/stone/graphite palette, ticket/stamp motif) rather than re-skin — Owner's explicit
  choice after reviewing 2026 UI/UX trend research. Role-based dashboards scoped owner/admin
  first, other roles later, one at a time — matches the trend research's "2-4 personas before
  laying out anything" guidance.
- Frontend dev port moved 3000 → 3010 (port 3000 taken by an unrelated app); Owner confirmed
  3010 is fine going forward, no need to reclaim 3000.
- Next.js upgrade (15→16, a major version) explicitly deferred to its own future step rather
  than bundled into Step 4 — Owner's choice, to avoid an untested breaking change riding along
  with unrelated work.

---

## Still Open

- Three README next-steps remain: #4 recovery ratio report (105 sqft/ton benchmark), #5
  per-slab dimension overrides for mixed-size batches, #6 item-level Tally detail import.
- Role-based dashboard views beyond owner/admin (accountant/manager/supervisor/operator/
  auditor) — not started, no brief written yet.
- Next.js 15→16 upgrade — deferred, own step when picked up, needs full regression pass.
- KG-2 (dpr-daily follow-up: daily staff_salary granularity for a future step, if ever wanted)
  and KG-4/KG-7 (Richard's deferred Should Fix items from Steps 1/2) are logged but not
  scheduled — see `handoff/BUILD-LOG.md` Known Gaps for full detail.
- Step 3's own Should Fix (non-blocking): session-summing in `computeDamagedSlabLoss` assumes
  `totalSlabsCut`/`damagedSlabCount` are always set together — holds today, would need revisit
  if the unused `CuttingSession.status = "aborted"` value is ever wired up.
- Richard also flagged (Step 2, Should Fix, not yet acted on): opening_balance/transfer_in
  creation has no minimum-data validation (e.g. nothing requires `weightTons` be supplied),
  and `input.startingState` isn't validated against its 3-value union.
- Production/AWS: no production environment exists at all right now. If/when one is set up,
  it'll be new infrastructure the Owner sets up deliberately — do not assume the old AWS
  resources are it.
- Local dev servers (backend port 4000, frontend port 3010) may still be running from this
  session — check before starting new ones, and remember both need a real restart (not hot-
  reload) to pick up any future `.env` changes.

---

## Resume Prompt

Copy and paste this to resume:

---

You are the Architect on this project.
Read README.md, then handoff/SESSION-CHECKPOINT.md, then ARCHITECT.md.
Confirm where we stopped and what the next action is. Then wait.

---

## Version Check
version_notified: v1.3.0
