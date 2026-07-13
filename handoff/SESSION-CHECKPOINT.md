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

**Known gap carried forward (KG-8, pre-existing and unrelated to this work):** a stuck migration
record (from before this session) blocks the `tally_voucher_item` table from existing yet, so
its RLS policy is written correctly in the migration but untested — the table just doesn't exist
in the live DB right now. Richard flagged an operational trap for whenever KG-8 gets resolved: a
routine `prisma migrate deploy` won't retroactively apply that table's RLS policy once the table
finally gets created (it'll error on already-existing objects if the migration file is naively
rerun) — someone has to manually apply those 3 statements, or that specific table could silently
end up unprotected. **Planned mitigation for Step 6B:** a startup-time assertion that every
expected tenant-scoped table actually has RLS enabled, so a gap like this fails loudly at boot
instead of silently.

**Next action:** write the Step 6B brief — the actual Gemini integration (question → generated
SQL → validated → executed via the RLS-protected read-only role → natural-language answer),
query logging for audit, and the owner-only chat page. Step 6A's Owner go-ahead only covered 6A
itself; 6B needs its own go-ahead before merging, per the same deploy-gate discipline.

**Repo:** `origin` is `https://github.com/sanjaymaverick-cmd/stoneos3.git`. Local `main` and
`origin/main` are identical at `94baf27`, confirmed synced both directions (fetched and
compared, not just trusting push output). CI/CD deploy workflow remains disabled
(`deploy.yml.disabled`).

---

## What Was Decided This Session (2026-07-13, Copilot direction)

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
- **Step 6A built and reviewed in isolation before any Step 6B work starts** — deliberate
  sequencing given everything else depends on this foundation being correct; matches the
  anti-drift "one step at a time" rule especially strictly here given the security stakes.

---

## Still Open

- Production/AWS: still no production environment exists at all. Unchanged from prior
  sessions — see `project-stoneos-production-deploy-hold` memory.
- Step 6B (Copilot backend + chat UI) — not started, brief not yet written.
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
