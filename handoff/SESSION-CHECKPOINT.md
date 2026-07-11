# Session Checkpoint — 2026-07-11
*Read this before reading anything else. If it covers current state, skip BUILD-LOG.*

---

## Where We Stopped

Steps 1 (historical backfill) and 2 (RawBlock opening-balance/entry-provenance) are both
built, reviewed clean by Richard, and committed locally (4 commits, `main` is ahead of
`origin/main` — nothing pushed). Local Postgres has Step 1's backfilled data
(2,421 Expense rows, 514 DailySalesSummary rows) plus Step 2's schema migration applied;
`raw_block` itself is empty (Step 2 only added capability, no real blocks entered yet).
Production RDS has not been touched by anything this session. Next action is whatever the
Project Owner wants to tackle next — nothing is mid-flight.

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
- Production/AWS: explicit hold, no pushes or deploys without a fresh, separate go-ahead
  specifically for production (local approval never extends to it).

---

## Still Open

- Production run of Step 1's backfill: not approved. Needs its own explicit go-ahead plus a
  plan (backup timing, etc.) per `ARCHITECT.md`'s deploy gate — see `project-production-
  deploy-hold` memory.
- Whether/when to push the 4 local commits to GitHub at all — not decided, currently held.
- KG-2 (dpr-daily follow-up: daily staff_salary granularity for a future step, if ever wanted)
  and KG-4/KG-7 (Richard's deferred Should Fix items from both steps) are logged but not
  scheduled — see `handoff/BUILD-LOG.md` Known Gaps for full detail.
- Richard also flagged (Step 2, Should Fix, not yet acted on): opening_balance/transfer_in
  creation has no minimum-data validation (e.g. nothing requires `weightTons` be supplied),
  and `input.startingState` isn't validated against its 3-value union.

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
