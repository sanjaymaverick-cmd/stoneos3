# Architect Brief
*Written by Architect. Read by Builder and Reviewer.*
*Overwrite this file each step — it is not a log, it is the current active brief.*

---

## Step 5D — Next.js 15 → 16 major-version upgrade

You are working in an isolated git worktree on branch `chore/nextjs-16-upgrade`. This is running
in parallel with three other independent steps (each in their own worktree, touching backend
code and other frontend pages) — do not assume anything about their state.

### Context — read before starting
This upgrade was previously deliberately deferred (see `handoff/SESSION-CHECKPOINT.md`'s
"What Was Decided This Session" — Step 4 session) specifically so a major-version breaking
change wouldn't ride along with unrelated feature work. The Project Owner has now explicitly
chosen to run it in parallel with three other builds anyway, accepting the added merge-conflict
risk (this branch touches shared/global files — `package.json`, `next.config`, `globals.css`
interactions, every `page.tsx` — that the other three branches may also touch in unrelated
ways). Because of that risk, **this step will be merged to `main` LAST**, after the other three
are already in — expect to rebase onto a moved `main` before your work is considered complete.
That rebase is the Architect's job at merge time, not yours to do mid-build, but build with the
awareness that your diff needs to be clean and easy to rebase (don't reformat files you don't
need to touch).

Current version: `next@15.5.20` (`packages/frontend/package.json`). Target: `16.2.10` (latest,
per `README.md`'s "Next steps" list).

### What to build
1. Read Next.js's official 15→16 upgrade guide (use `npx @next/codemod@canary upgrade latest`
   from `packages/frontend/` if available, or bump manually — your call on which is cleaner for
   this codebase's size) and identify every breaking change relevant to this app specifically
   (App Router usage, no Pages Router here per `README.md`'s structure section).
2. **Clerk compatibility check first, before touching anything else:** this app uses Clerk Core
   3 (`@clerk/nextjs` v7). Verify `@clerk/nextjs` v7's supported Next.js version range actually
   includes 16 before proceeding. If it does not, **stop and escalate to the Architect** rather
   than also upgrading Clerk unbriefed (a simultaneous Clerk major-version bump is a separate,
   much riskier scope change — auth is the one thing that can't be silently broken).
3. Bump `next`, and any peer dependencies Next 16 requires (React/React DOM versions, etc.) in
   `packages/frontend/package.json`.
4. Fix every breaking change surfaced by `tsc --noEmit` and `npm run build` failures —
   systematically, not by suppressing errors. Common Next 15→16 areas to expect: async
   `params`/`searchParams` handling in Server Components/route handlers (if used anywhere in
   this codebase — check `packages/frontend/app/` for any `params`/`searchParams` usage),
   caching-default changes, config option renames in `next.config.*`, and codemod-covered API
   renames.
5. **Full regression pass across every page** — this app is small enough to check all of them:
   `/`, `/sign-in`, `/sign-up`, `/dashboard`, `/sales`, `/expenses`, `/dpr`, `/polishing`,
   `/admin/users`. For each: confirm it builds, confirm `tsc --noEmit` is clean, and where
   feasible confirm it renders in a real browser without new console errors (use the
   `preview_start`/browser tools available to you — signed-out pages like `/sign-in` can be
   checked directly; signed-in pages will show the `AuthGate` sign-in redirect correctly if you
   can't authenticate, which is itself a valid check that routing/rendering didn't break).

### Flags
- Do not touch backend code (`packages/backend/`) at all — this is frontend-only.
- Do not upgrade any other frontend dependency beyond what Next 16 strictly requires as a peer
  (no opportunistic bumps of unrelated packages).
- Do not change `.claude/launch.json`'s port configuration (frontend stays on 3010 — see
  `handoff/SESSION-CHECKPOINT.md`) unless the upgrade itself somehow requires it (it shouldn't).
- Do not attempt to also fix or improve any existing page's functionality while you're in there
  regression-testing it — scope is strictly "still works after the upgrade," not "now works
  better." Log anything you notice that's broken but pre-existing (not caused by this upgrade)
  to `handoff/BUILD-LOG.md` Known Gaps instead of fixing it.
- If Clerk (step 2 above) blocks the upgrade, stop immediately and write that finding to
  `handoff/REVIEW-REQUEST.md` marked clearly as an escalation, not a completed step — do not
  attempt a partial/workaround upgrade.

### Definition of Done
- [ ] Clerk v7 / Next 16 compatibility explicitly confirmed (or escalated and stopped, per Flags)
- [ ] `next` bumped to `16.2.10`, peer deps aligned
- [ ] All breaking changes fixed, no suppressed errors
- [ ] `tsc --noEmit` clean, `npm run build` clean
- [ ] Every page in the regression list above checked and confirmed working
- [ ] No backend files touched, no unrelated dependency bumps
- [ ] `handoff/REVIEW-REQUEST.md` written in this worktree, including the full regression
      checklist results per page

---

## Builder Plan
*Builder adds their plan here before building. Architect reviews and approves.*

### 1. Clerk compatibility check (done, before any code)
Confirmed via web search + `@clerk/nextjs` changelog: `@clerk/nextjs` v7 (Core 3) has added
explicit Next.js 16 support, including improved error detection for `auth()`/`currentUser()`
inside `"use cache"` functions. Currently pinned `^7.5.15`; no Clerk version bump is needed or
planned. Proceeding with the Next.js bump.

### 2. Codebase surface scan (done)
- No `middleware.ts`/`middleware.js` in `packages/frontend` — the `middleware` → `proxy` rename
  does not apply here.
- No parallel routes (`@slot` folders) — the new `default.js` requirement doesn't apply.
- No `params`/`searchParams` usage anywhere under `packages/frontend/app/` (grep confirmed) —
  async Request API changes are a non-issue for this codebase.
- No `next/image` or `next/legacy/image` usage anywhere — the `next/image` config changes
  (`minimumCacheTTL`, `imageSizes`, `qualities`, `localPatterns`, `domains` deprecation) don't
  apply.
- No AMP usage, no `revalidateTag`/`unstable_cacheLife`/`unstable_cacheTag` usage, no
  `serverRuntimeConfig`/`publicRuntimeConfig` usage, no `experimental.ppr`/`dynamicIO`/`useCache`
  flags in `next.config.js`.
- `next.config.js` is minimal: `reactStrictMode`, `output: "standalone"`, and a plain `env` block
  for `NEXT_PUBLIC_API_URL`. None of these are affected by the 16 upgrade. No `experimental`
  block, so no `experimental.turbopack` → top-level `turbopack` rename needed.
- `package.json` scripts are already `next dev` / `next build` / `next start` with no
  `--turbopack`/`--turbo` flags to remove — Turbopack becomes the default automatically, nothing
  to change there. No custom webpack config exists, so the "build fails if webpack config found"
  Turbopack-by-default risk doesn't apply.
- `app/layout.tsx` sets `<html lang="en">` with no `scroll-behavior: smooth` in `globals.css`
  (will double-check CSS at build time, but not expected) — scroll-behavior override change is
  moot.
- Node is v26.5.0 locally (>> the 20.9 minimum) and TypeScript is `^5.5.0` (>= 5.1 minimum) —
  both satisfy Next 16's raised minimums already.
- `next-env.d.ts` will be regenerated by Next automatically on next build/dev; no manual edit.

Net effect: this is a low-risk version bump for this specific app — almost none of the "common
breaking change" areas the brief calls out actually apply, because the app doesn't use dynamic
routes, images, middleware, or the caching APIs affected. The work is mostly the dependency bump
itself plus verifying the build/typecheck stay clean.

### 3. Planned changes
1. `packages/frontend/package.json`:
   - `next`: `^15.5.20` → `16.2.10` (pinned exact, matching the brief's target, not caret — avoids
     silently drifting to a newer major/minor later).
   - `react`: `^18.3.0` → `^19.2.7` (latest, per Next's manual-upgrade instructions and peer
     dependency range `^19.0.0`).
   - `react-dom`: `^18.3.0` → `^19.2.7`.
   - `@types/react`: already `19.2.17` — no change needed (confirmed still latest).
   - Add `@types/react-dom`: `^19.2.3` as a new devDependency — it was missing before even for
     React 18, but since we're touching this block anyway and `react-dom` is going to v19, add it
     explicitly so TS resolves react-dom types correctly instead of implicitly/optionally. This is
     the one addition beyond a strict version bump; flagging it here rather than silently doing it,
     since the "no opportunistic bumps" flag technically covers additions too — but this is a
     types-only devDependency required for correctness with the react-dom bump, not a functional
     dependency change.
   - `@clerk/nextjs` stays at `^7.5.15` (no bump).
2. Run `npm install` from worktree root (monorepo — installs both workspaces, but only
   `packages/frontend` files are modified).
3. Run `npx tsc --noEmit` and `npm run build` in `packages/frontend`, fix any breaking changes
   that surface (not expected to be many, per the scan above, but will handle anything real
   found rather than assuming the scan is exhaustive).
4. Regression pass: `preview_start` the frontend dev server (or built server) on port 3010 per
   `.claude/launch.json`, and load each of the 9 listed routes in the browser tool, capturing
   console errors. Signed-out pages will hit the Clerk `AuthGate` redirect to `/sign-in` — that is
   an expected pass, not a failure, per the brief.
5. Update `handoff/BUILD-LOG.md` and write `handoff/REVIEW-REQUEST.md` with `Ready for Review: YES`.

### Open question for Arch (non-blocking, proceeding with my stated choice)
Pinning `next` to an exact `16.2.10` instead of `^16.2.10` — matching the brief's literal target
version and avoiding silent future drift given this branch merges last and gets rebased. Will
flag this choice in REVIEW-REQUEST.md; easy to switch to caret if Richard/Arch prefers standard
caret-range convention consistent with the rest of the file.
