# Session Checkpoint — 2026-07-11
*Read this before reading anything else. If it covers current state, skip BUILD-LOG.*

---

## Where We Stopped

Steps 1 (historical backfill), 2 (RawBlock opening-balance/entry-provenance), and 3 (damaged-
slab cost allocation on `GET /raw-blocks/:id`) are all built and reviewed clean by Richard.
README items 1 (bootstrap), 2, 3, 7, 8(superseded), 9 are all closed out — remaining open items
are #4 (recovery ratio report), #5 (per-slab dimension overrides), #6 (item-level Tally
detail).

**Repo migrated this session:** `origin` moved from `sos.git` (old AWS learning-exercise repo,
now out of scope) to `https://github.com/sanjaymaverick-cmd/stoneos3.git`. Everything is
committed AND pushed — local `main` and `origin/main` are identical at `bc12da6`. Nothing is
held back this time (earlier in the session pushing was on hold; the Owner lifted that once the
new repo was set up).

**Local Postgres state:** Step 1's backfilled data (2,421 Expense rows, 514 DailySalesSummary
rows), Step 2's schema migration applied, `raw_block` itself still empty (no real blocks
entered yet — Steps 2/3 only added capability). Bootstrap has been run for real: factory "Vedam
Granites" (`4485c4f7-...`) has B-21 + LPM machines seeded and `sanjay.maverick@gmail.com`
granted owner access (`app_user` row, Clerk `publicMetadata` set) — verified directly against
Postgres, not just script output.

There is no production environment for this project — the old AWS deployment is explicitly out
of scope (see `project-stoneos-production-deploy-hold` memory), and historical-backfill
execution against any future real environment is the Owner's own manual responsibility (see
`project-backfill-manual-by-owner` memory), not the team's. Next action is whichever remaining
README next-step the Project Owner wants to tackle — nothing is mid-flight.

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

---

## Still Open

- Three README next-steps remain: #4 recovery ratio report (105 sqft/ton benchmark), #5
  per-slab dimension overrides for mixed-size batches, #6 item-level Tally detail import.
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
