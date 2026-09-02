# Session Checkpoint — 2026-07-13
*Read this before reading anything else. If it covers current state, skip BUILD-LOG.*

---

## Where We Stopped

**Active work: building the AI Business Analyst / Copilot (README item #10).** This is the
first genuinely new-product-behavior phase of the project — everything before it was foundation
(clean structured data, traceability). Direction was set through an explicit conversation with
the Owner (not assumed):

- **Interface:** chat/Q&A embedded in the StoneOS app (a new page, owner-only).
- **First job:** answer ad-hoc natural-language questions over real business data.
- **Query mechanism:** free-form LLM-generated SQL — the Owner was shown the safer alternative
  (a fixed tool-calling layer over typed backend functions) and chose flexibility anyway, an
  informed call given the risk. Mitigation is Postgres Row-Level Security making cross-tenant
  access structurally impossible, not "hope the LLM remembers to scope by factory."
- **LLM provider:** Google Gemini, not Anthropic Claude — the Owner wanted to avoid a new
  Anthropic billing setup; Gemini has a genuinely free tier. Interface stays embedded in the app
  (the alternative considered — using the Owner's own existing Claude access via an MCP server —
  was explicitly rejected because it would've moved the interface out of the app).
- **Access scope:** owner-only for v1, matching the existing dashboard's owner/admin gating
  precedent (though even narrower — just owner, not admin).

**Step 6A (database safety foundation) is DONE, reviewed clean, and merged/pushed** — this had
to come first and be proven airtight before any LLM-facing code, since it's the entire safety
story for free-form SQL. Built: a new `stoneos_copilot_ro` Postgres role (SELECT-only, no
write/DDL grants, not superuser, no BYPASSRLS) plus Row-Level Security policies on 35
tenant-scoped tables (19 with their own `factory_id` column, 16 child tables scoped via a
subquery through their parent's `factory_id`), enforced by a per-connection
`app.current_factory_id` session variable that fails closed (zero rows, not an error, not all
rows) when unset. Richard reviewed independently — re-derived the full table list from
`schema.prisma` himself rather than trusting Bob's count, live-tested RLS under adversarial
conditions (cross-tenant joins, UNION ALL across child tables, fail-closed checks with
unset/empty/garbage session values) — 0 Must Fix. The Architect then independently re-verified
the load-bearing claims directly against the live database (policy count, role permissions, data
baseline) before pushing, since a system note flagged the safety classifier was unavailable
during Richard's review. Everything checked out.

**Step 6B (Gemini integration + owner-only chat page) is also DONE, reviewed clean, and
merged/pushed.** Built on top of 6A: `POST /copilot/ask` (owner-only) takes a question, sends it
plus a curated schema description to Gemini, validates the returned SQL (single statement,
`SELECT` or `WITH`/CTE only, no write/DDL keywords, row-limited), executes it through the
`stoneos_copilot_ro` role scoped via `SELECT set_config('app.current_factory_id', $1, true)`
inside an explicit transaction, sends the result back to Gemini for a plain-language answer, and
logs every attempt (success or failure) to a new `CopilotQueryLog` table for audit — deliberately
outside Step 6A's RLS scope, since it's only ever touched through normal factoryId-scoped Prisma
calls, never by the LLM-generated SQL. A startup-time assertion (the 35-table list copied
verbatim from Step 6A's migration) fails only the Copilot module's own readiness if any expected
table is ever missing RLS, without taking down the rest of the app — the planned mitigation for
KG-8's operational trap. Frontend: owner-only chat page at `/copilot`, generated SQL shown
expandable per answer for transparency. Richard independently re-verified the
set_config/pooled-connection question with his own adversarial test (forced single-connection
reuse via `max: 1`, probed the session variable *between* two factories' requests on the same
physical connection, tested the rollback path) — confirmed no leak, not just accepted the
description. One real gap found (CTEs rejected by an overly literal "must start with SELECT"
check) was the brief's own wording, not a Bob defect — fixed directly by the Architect, confirmed
a data-modifying CTE is still caught by the keyword scan regardless of the CTE-shape fix. Fully
merged/pushed result re-verified with a clean `tsc --noEmit` + `npm run build` in both packages
post-merge.

**Known gap carried forward (KG-8, pre-existing and unrelated to Copilot work):** still open,
unchanged — see prior entry below. Not scheduled to be resolved as part of this feature.

**Gemini API key added and live-tested directly against Google's API** (not just assumed to
work): authenticates correctly (`ListModels` returned `200 OK` with a real model list), but the
account currently has **zero free-tier quota provisioned** for `generateContent` on every pinned
model tried (`gemini-2.0-flash`, `gemini-2.0-flash-001` — consistent `429, limit: 0`), and
`gemini-2.5-flash` is `404, no longer available to new users` (a newly-created account/key being
steered toward `-latest` aliases), which are themselves hitting transient `503`/timeouts right
now. **This is a Google-account-side provisioning issue, not a bug in the integration** — the
code is correctly wired to whichever of `GEMINI_API_KEY`/`GOOGLE_API_KEY` ends up working once
quota clears (check account status directly at aistudio.google.com). Key is stored in
`packages/backend/.env` (gitignored, confirmed not tracked) — **the Owner should consider
rotating/regenerating this key**, since it was pasted directly into the chat conversation and is
therefore sitting in that conversation's history.

**Next action:** once the Gemini quota issue is resolved (Owner's own step, on Google's side),
do a real end-to-end live test of `/copilot/ask` — nothing has actually exercised the two live
Gemini calls yet, everything else in the flow (validation, RLS-scoped execution, logging,
readiness check) is independently verified. No further Copilot build work is planned until that
live test happens and surfaces anything.

**Repo:** `origin` is `https://github.com/sanjaymaverick-cmd/stoneos3.git`. Local `main` and
`origin/main` are identical at `7a79ac4`, confirmed synced both directions (fetched and
compared, not just trusting push output). There is no CD pipeline — pushes trigger nothing.

---

## What Was Decided This Session (2026-07-13, Copilot direction + build)

- **Query approach — free-form SQL over tool-calling:** the Owner's explicit, informed choice
  after being shown both options and the risk tradeoff. Mitigated with RLS rather than left as
  an unmitigated risk (see Step 6A above).
- **LLM provider — Gemini over Anthropic:** avoids a new Anthropic billing setup; Gemini's free
  tier is sufficient for now. This was itself a two-step clarification — the Owner's first
  instruction ("without needing Anthropic api key") was ambiguous between "swap providers" and
  "use my existing Claude access via MCP instead," and those have very different user-facing
  implications (where you actually go to ask a question) — asked directly rather than guessing,
  got "swap providers, keep chat in the app."
- **Security architecture, Architect's technical call:** Postgres RLS + a dedicated read-only
  role, not application-layer scoping checks — makes the tenant-isolation guarantee hold even if
  the LLM-generated SQL forgets to filter by factory, rather than depending on prompt
  instructions being followed correctly every time.
- **Step 6A built and reviewed in isolation before any Step 6B work started** — deliberate
  sequencing given everything else depends on this foundation being correct; matches the
  anti-drift "one step at a time" rule especially strictly here given the security stakes.
- **CTE support added to the SQL validator, Architect's direct fix after Richard's review** — the
  brief's own literal "must start with SELECT" wording was too strict; fixed without weakening
  the keyword-based write/DDL blocklist that still catches data-modifying CTEs regardless.
- **Gemini API key pasted directly into chat by the Owner** — added to `.env` (gitignored) and
  live-tested rather than assumed to work; flagged the rotation recommendation given it's now in
  conversation history, per [[feedback-verify-before-declaring-unavailable]]'s spirit of
  verifying rather than assuming, this time applied to verifying a credential actually works
  rather than assuming a tool is unavailable.

---

## Still Open

- Hosting: no environment exists at all, and standing one up is unscoped. All cloud
  infrastructure config was removed from the repo on 2026-09-02 (see CHANGELOG).
- **Live end-to-end test of `/copilot/ask`** — blocked on the Gemini account's free-tier quota
  provisioning clearing (Owner's own step, on Google's side, see above). Everything else in the
  Copilot feature is built, reviewed, and independently verified.
- KG-8 (stuck migration blocking `tally_voucher_item`) — pre-existing, unrelated to Copilot work,
  not scheduled to be resolved as part of this feature; Step 6B's startup RLS-coverage assertion
  is a mitigation for its downstream risk, not a fix for KG-8 itself.

---

<details>
<summary>Prior session summary — Steps 5A-5D (parallel-build round, 2026-07-12), collapsed for length</summary>

All four of that session's parallel-built steps (5A recovery ratio report, 5B per-slab dimension
overrides, 5C item-level Tally import, 5D Next.js 15→16 upgrade) were built in isolated git
worktrees, independently reviewed with 0 Must Fix each, merged sequentially, and verified
end-to-end post-merge. README's original next-steps list is fully closed — items #4-#6 done,
and the two remaining loose ends (Tally real-data verification, role dashboards beyond
owner/admin) are explicitly OUT OF SCOPE for this version per the Owner's direct call, not
pending work. A `/graphify` knowledge-graph build of the repo (committed to `graphify-out/` per
the Owner's call) caught and fixed a stale README claim (Dashboard showed as placeholder-only
after Step 4 had actually shipped a real one) and traced two "god nodes," one a genuine
single-responsibility-erosion candidate (`RawBlockService`) and one a graphify AST extraction
bug, not a real code issue (`PolishingSessionService`). Step 5D's dual-React-copy fix was
confirmed with a real Docker build (not just simulated) — single React 19.2.7 copy in the actual
image, clean container boot. Full detail in `handoff/BUILD-LOG.md`'s Step 5A-5D entries and git
history around commits `684d955`..`81fa0d4`.

</details>

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
