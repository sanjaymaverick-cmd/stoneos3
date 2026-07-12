# Session Checkpoint — 2026-07-12
*Read this before reading anything else. If it covers current state, skip BUILD-LOG.*

---

## Where We Stopped

Steps 5A (recovery ratio report, README #4), 5B (per-slab dimension overrides, README #5), and
5C (item-level Tally import + cross-check, README #6) were built in parallel using isolated git
worktrees (one branch/worktree per step, avoiding collisions on the shared `handoff/*.md`
files), each independently reviewed by Richard with 0 Must Fix, merged into `main` with
`--no-ff` merge commits, verified end-to-end on `main` (not just per-branch) with a clean
`tsc --noEmit` + `npm run build` in both packages, and pushed to `origin/main` — all on
2026-07-12, with the Owner's explicit go-ahead for the merge.

README's remaining next-steps list is now down to one: #6 is done (with a caveat — see below).
Step 5D (Next.js 15→16 major-version upgrade) was also built in its own worktree and reviewed,
but is **not yet merged** — Richard's review surfaced a real dependency-conflict finding (see
below) that needs a decision before it lands. It was deliberately planned to merge last since it
touches the broadest shared surface.

**Repo:** `origin` is `https://github.com/sanjaymaverick-cmd/stoneos3.git`. Local `main` and
`origin/main` are identical at `48a1afa` — Steps 5A/5B/5C and the post-merge brief reset are all
pushed. CI/CD deploy workflow remains disabled (`deploy.yml.disabled`); the push triggered no
side effects. Step 5D's branch (`chore/nextjs-16-upgrade`) is NOT merged or pushed yet.

**Worktrees:** four isolated worktrees were created under `worktrees/` for this session's
parallel-build round: `recovery-ratio-report`, `slab-dimension-overrides`, `tally-item-detail`
(all merged, safe to remove), and `nextjs-16-upgrade` (still active, holds Step 5D's unmerged
work — do not remove until that step is resolved). Removing a worktree: `git worktree remove
worktrees/<name>` from the main checkout, then `git branch -d <branch>` once merged.

**Open decision for next session (or immediately, if resuming same-session):** Step 5D found
that the production `.next/standalone` build artifact ships **two live React copies** —
`lucide-react@0.383.0`'s peer range caps React at `^18.0.0`, which blocks npm from hoisting the
upgrade's `react@19.2.7` to the workspace root. Root `node_modules` (and everything resolving
through it, including `next` and `@clerk/nextjs`) stays on React `18.3.1`; `19.2.7` only exists
nested inside `packages/frontend/node_modules`. Confirmed NOT an active break today (Richard
started the built standalone server and curled `/sign-in` — clean 200, real Clerk markup) but a
real landmine for future work. Three options, unresolved: (a) add an npm `overrides` entry
forcing a single `react`/`react-dom` version workspace-wide — smallest, most standard fix, no
unrelated dependency bumped; (b) bump `lucide-react` to `1.24.0` (declares React 19 support) —
its own major-version jump, out of this step's original scope; (c) accept the current mixed-copy
state and merge as-is. Architect's lean is (a); needs to actually be applied, re-verified, and
then Step 5D can merge.

**Remaining open items (from README, all pre-existing, unchanged this session):**
- #6 (item-level Tally import) is built but **real-data verification is NOT done** — no real
  Tally XML export exists in this repo (confidential business data, passed as external CLI args
  to `validate-tally-parser.js`). This is the Owner's own manual step, same pattern as
  historical-backfill execution — see `project-backfill-manual-by-owner` memory. Also carried
  forward as the Owner's call, not resolvable at the code level: whether the Sales-voucher-type
  filter (`"Sales"`, case-insensitive) is specific enough for real Tally voucher-type names, and
  whether `ACTUALQTY` vs `BILLEDQTY` precedence is right — both flagged transparently by Bob and
  Richard as unverified guesses.
- Role-based dashboard views for accountant/manager/supervisor/operator/auditor — still not
  started, no brief written. Deliberately held out of this parallel-build round (would need
  product/UX input per role, not just technical scoping).
- Next.js 15→16 upgrade (Step 5D) — see "Open decision" above.

**Local Postgres state:** unchanged this session — no code from 5A/5B/5C/5D was exercised
against a live database at any point (all four worktrees had no reachable `DATABASE_URL`;
correctness was verified by hand-tracing code/diffs, not live queries). `raw_block` and
`sales_order`/`sales_line_item` remain empty locally, same as end of last session.

**Local dev environment:** unchanged — frontend dev server on port 3010, backend on 4000 (see
prior checkpoint history below if resuming fresh). Not touched this session beyond worktree-local
`npm install`s (each worktree has its own independent `node_modules`, no shared state with the
main checkout's dev servers).

---

## What Was Decided This Session

- **Parallelization approach:** the Owner asked to "start all" remaining README items at once.
  Architect flagged that the three-man-team handoff protocol (`ARCHITECT-BRIEF.md`,
  `BUILD-LOG.md`, `REVIEW-REQUEST.md`, `REVIEW-FEEDBACK.md`) is single-threaded by design
  (shared files, explicitly "overwrite each step, not a log" for the brief) and true parallelism
  would corrupt that trail. Resolved with git worktrees — one isolated branch + working directory
  per step, avoiding collisions during build/review, merged back to `main` sequentially.
- **Scope of the parallel batch, Owner's explicit choice:** README #4/#5/#6 (recovery ratio
  report, per-slab dimension overrides, item-level Tally detail) plus the Next.js 15→16 upgrade,
  run together — Owner chose to include the Next.js upgrade despite Architect flagging it as
  higher-risk (touches the broadest shared surface, was previously deliberately deferred to its
  own isolated step). Role-based dashboards for the remaining 5 personas were held out (no brief
  existed, needs product input, Architect's call to defer rather than draft briefs unbriefed).
- **Next.js upgrade merges last**, after the other three are already on `main` — Architect's
  technical call to minimize conflict surface, since this step touches `package.json` and
  broadly shared frontend files the other three don't.
- **Recovery ratio route path:** flattened from the brief's own example (`/reports/recovery-ratio`)
  to `/recovery-ratio`, matching every other page's flat convention — Richard escalated it as a
  navigation-convention call, Architect decided and fixed directly (two-file change) rather than
  a Bob round-trip, matching the Step 4 precedent for tiny Architect-closed gaps.
- **Tally item-level parsing constraint:** confirmed no real Tally XML export exists anywhere in
  this repo (business-confidential, passed as external CLI args) — Step 5C was explicitly briefed
  to build against documented/inferred structure only and NOT claim real-data verification,
  matching the standing rule that real-data runs are the Owner's own manual step.
- Steps 5A/5B/5C merge: Owner gave explicit go-ahead in chat after reviewing the three cleared
  verdicts; merged, integration-verified on `main`, and pushed same session.

---

## Still Open

- **Step 5D's React dual-copy fix** — needs to actually be applied (Architect's lean: npm
  `overrides` forcing a single React version), re-verified, then merged. This is the very next
  action if resuming immediately.
- README #6's real-data verification and the two flagged unverified assumptions (Sales-voucher
  filter specificity, ACTUALQTY/BILLEDQTY precedence) — Owner's own manual step once he has a
  real Tally export to test against.
- Role-based dashboard views beyond owner/admin — not started, no brief written yet.
- Worktree cleanup: `worktrees/recovery-ratio-report`, `worktrees/slab-dimension-overrides`,
  `worktrees/tally-item-detail` are merged and safe to remove (`git worktree remove <path>` +
  `git branch -d <branch>`) whenever convenient — not urgent, just housekeeping.
- Production/AWS: still no production environment exists at all. Unchanged from prior sessions —
  see `project-stoneos-production-deploy-hold` memory.

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
