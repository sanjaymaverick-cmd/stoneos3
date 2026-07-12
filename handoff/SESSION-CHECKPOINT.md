# Session Checkpoint — 2026-07-12
*Read this before reading anything else. If it covers current state, skip BUILD-LOG.*

---

## Where We Stopped

All four of this session's parallel-built steps are done: 5A (recovery ratio report, README
#4), 5B (per-slab dimension overrides, README #5), 5C (item-level Tally import + cross-check,
README #6), and 5D (Next.js 15.5.20 → 16.2.10 major-version upgrade). Each was built in its own
isolated git worktree (avoiding collisions on the shared `handoff/*.md` files), independently
reviewed by Richard with 0 Must Fix, merged into `main` with `--no-ff` merge commits (5D last,
per plan), and the fully-merged result was verified end-to-end with a clean-reinstall +
`tsc --noEmit` + `npm run build` pass in both packages — confirming all four independently-built
changes actually integrate correctly together, not just individually. All pushed to
`origin/main`.

README's original "Close out remaining gaps" next-steps list is now fully closed except for two
items, both intentionally left open (see below): #6's real-data verification, and role-based
dashboards beyond owner/admin.

**Repo:** `origin` is `https://github.com/sanjaymaverick-cmd/stoneos3.git`. Local `main` and
`origin/main` are identical at `be4a1d1`. CI/CD deploy workflow remains disabled
(`deploy.yml.disabled`) — none of this session's pushes triggered any side effect.

**Worktrees:** all four (`recovery-ratio-report`, `slab-dimension-overrides`,
`tally-item-detail`, `nextjs-16-upgrade`) are merged and safe to remove — this is the very next
housekeeping step if resuming immediately. `git worktree remove worktrees/<name>` from the main
checkout for each, then `git branch -d <branch>` for the four now-merged branches
(`feat/recovery-ratio-report`, `feat/slab-dimension-overrides`, `feat/tally-item-detail`,
`chore/nextjs-16-upgrade`).

**Local Postgres state:** unchanged this session — no code from any of the four steps was
exercised against a live database at any point (no worktree had a reachable `DATABASE_URL`;
correctness was verified by hand-tracing code/diffs and, for 5D, an isolated dependency-install
simulation). `raw_block` and `sales_order`/`sales_line_item` remain empty locally.

**Local dev environment:** unchanged — frontend dev server on port 3010, backend on 4000. Not
started this session; each worktree used its own independent `node_modules`, no shared state
with any running dev servers. The root checkout's `node_modules` was wiped and freshly
reinstalled during final verification (now on Next 16 / React 19) — a dev server restart (not
hot-reload) is needed to pick this up if one was left running from a prior session.

---

## What Was Decided This Session

- **Parallelization approach:** the Owner asked to "start all" remaining README items at once,
  then confirmed literal parallelization. Architect flagged the three-man-team handoff protocol
  is single-threaded by design (shared, "overwrite each step" files) and resolved it with git
  worktrees — one isolated branch + working directory per step, merged back to `main`
  sequentially to avoid corrupting the handoff trail.
- **Batch scope, Owner's explicit choice:** README #4/#5/#6 plus the Next.js 15→16 upgrade, run
  together — Owner chose to include the upgrade despite Architect flagging it as higher-risk
  (broadest shared surface, previously deliberately deferred). Role-based dashboards for the
  remaining 5 personas were held out (no brief existed, needs product input).
- **Next.js upgrade merged last**, after the other three — minimized conflict surface, confirmed
  the right call in practice (it was the only step needing a genuine cross-cutting dependency
  fix after review).
- **Recovery ratio route path** flattened from `/reports/recovery-ratio` to `/recovery-ratio` to
  match every other page's flat convention — Architect's direct fix after Richard escalated it.
- **Tally item-level parsing:** confirmed no real Tally XML export exists anywhere in this repo;
  Step 5C was explicitly built against inferred structure only, with real-data verification
  explicitly deferred to the Owner's own manual step (matching the standing backfill-execution
  rule).
- **Dual-React-copy fix (Step 5D):** Richard's review found the production build artifact shipped
  two live React copies because `lucide-react`'s peer range (`^18.0.0`) blocked React 19 from
  hoisting to the workspace root. Fixed with an npm `overrides` entry added to **both** the root
  `package.json` and `packages/frontend/package.json` — the root-only fix would have been
  insufficient, since `docker-compose.prod.yml`'s frontend build context is `./packages/frontend`
  alone and never sees the root `package.json`. Verified by simulating that exact isolated
  install in a scratch directory (single React 19.2.7 copy resolved correctly). Considered and
  explicitly rejected pinning `outputFileTracingRoot`/`turbopack.root` in `next.config.js` — the
  correct value genuinely differs between the isolated Docker build and local monorepo dev, and
  Next 16 requires both settings to match, so hardcoding either broke the other. Left
  `next.config.js` untouched; the residual "workspace root inference" warning seen when building
  directly inside the nested worktree is confirmed to be an artifact of this session's temporary
  multi-worktree structure, not a real risk to the actual Docker deployment path (which never
  sees sibling worktrees or the outer checkout).
- **Process note:** a stray unresolved git conflict marker (`<<<<<<< HEAD`) was accidentally left
  in `BUILD-LOG.md` during the Step 5C merge conflict resolution, caught during a pre-5D-merge
  re-scan of all handoff files, and fixed in its own commit before continuing. Worth being extra
  careful about when resolving multi-block conflicts across sequential worktree merges — git's
  line-based 3-way merge produced misleading "false match" interleaving on the review-feedback
  logs more than once this session (near-identical boilerplate text across different steps'
  sections caused git to merge them incorrectly rather than flag a clean conflict); the reliable
  fix each time was extracting all three merge stages (`git show :1/:2/:3:<file>`) and manually
  reassembling by content boundary rather than trusting the inline conflict markers.

---

## Still Open

- **README #6's real-data verification** and its two flagged unverified assumptions (Sales-
  voucher-type filter specificity, `ACTUALQTY`/`BILLEDQTY` precedence) — Owner's own manual step
  once he has a real Tally export to test against.
- **Recommended before actual deployment:** a real `docker compose -f docker-compose.prod.yml
  build frontend` + smoke-test, as final confirmation of the dual-React-copy fix in an actual
  Docker build (not verifiable in this environment — no Docker available here).
- Role-based dashboard views beyond owner/admin — not started, no brief written yet.
- Worktree cleanup (see "Worktrees" above) — housekeeping, not urgent, but the natural next
  action if resuming immediately.
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
