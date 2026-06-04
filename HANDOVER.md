# HANDOVER — GrowwStacks OS

For **Shubham** (incoming developer). Generated from the repo + git history and verified against the code, not memory. When this file and the code disagree, the code wins — re-verify and fix this file.

Read order on day one: this file → `CLAUDE.md` (rules of engagement) → `docs/ARCHITECTURE.md` (what to build) → `PLAN.md` (phases) → `PROGRESS.md` (running log; note it is stale relative to the latest commits — see §2).

---

## 1. What this is + layout + stack

**GrowwStacks OS** — an AI-first internal operating system for a ~30–40-person automation agency, replacing Airtable + HubSpot + GHL. Core entities: contacts (the hub), companies, deals, projects, milestones, tasks, payments, users — plus polymorphic universal modules (notes, attachments, conversation, ai_insights, ratings, tests) and a planned multi-agent AI supervisor.

**Single repo** (not multi-repo) — the Next.js app lives at the root:

```
/CLAUDE.md  /PLAN.md  /PROGRESS.md  /HANDOVER.md      ← operating docs
/docs/ARCHITECTURE.md                                 ← source of truth (schema/behaviour)
/migrations/        0000…0018  (forward-only SQL; human applies — see §3)
/lib/               db.ts (asUser), auth.ts, actions/<entity>.ts, guards.ts, types-*.ts
/app/               <entity>/page.tsx + <entity>/[id]/page.tsx (server-components-first)
/components/        per-entity + /cards (shared polymorphic + time-log/test forms)
/playwright/        smoke/*.spec.ts + support/ (per-role session minting)
/scripts/           dev-reset-seed.mjs, apply-migrations.sh, check-tokens-only.sh, build-tokens.mjs
/design/            Claude Design handoff (HTML UI kits the cockpits were built from)
/.claude/           agents/ skills/ commands/ README.md — the agent operating model
                    (present locally, CURRENTLY UNCOMMITTED — `git status` shows `?? .claude/`)
```

**Stack (verified in `package.json` / code):** Neon Postgres · Cloudflare Pages, edge runtime (`@cloudflare/next-on-pages`, `export const runtime = 'edge'`) · **Auth.js (next-auth `5.0.0-beta.25`)** with Resend magic-link, invite-only · Neon serverless HTTP driver (`@neondatabase/serverless`) · Next.js `^15.1.6` / React `^19` (server-actions-first) · zod · lucide-react · Tailwind→CSS-var tokens. Planned (not built): n8n in/out + Google Drive (Phase 5), Cloudflare Workers+Cron AI via OpenRouter (Phase 3).

> ⚠️ **CLAUDE.md drift (corrected in this commit):** CLAUDE.md §"Stack (locked)" said *"Neon Auth (magic-link/OTP)"*. Reality is **Auth.js** — a deliberate, documented deviation (`PROGRESS.md` → "AUTH DECISION"; Neon Auth is left OFF because its open public signup conflicts with the invite-bound internal model). I corrected that one token in CLAUDE.md. Everything else in CLAUDE.md still matches reality; the other future-stack items (n8n, Workers+Cron, OpenRouter) are correctly described as the plan, not as built.

---

## 2. Current state + commit trail

**Phase 1 (core functionality) is built**: 8 entity list + detail cockpits live and RLS-verified; the cross-cutting layer is in progress (steps 0–2 done). Database is at **migration 0018** (19 files `0000`→`0018`, all applied on Neon).

Commit trail (newest first; `git log --oneline`):

| Commit | What |
|---|---|
| `1a9a821` | **step 2** — record + archive dev/UAT tests on milestone & task cockpits; live project Tests pane |
| `a9e6ce4` | **step 1** — time-log entry + own-log archive on task cockpit; surface rollup total |
| `d15f410` | **0018** — gated `SECURITY DEFINER` aggregates for the time rollups → restore PM aggregate visibility |
| `1e65fc4` | **step 0** — enrich seed: `time_logs`, `tests`, `ratings`, `availability`, `task_managers` |
| `776d0af` | **0017** — drop misfired `trg_touch_updated_at` on `user_availability` |
| `ebacf89` | Initial commit — DB (**migrations 0000–0016**) + 8 entity cockpits + RLS walls + demo seed |
| `1b35fb8` | GitHub scaffold (`.gitignore` only) |

> `0016` (`contact_job_title`) is **inside** `ebacf89`, not a standalone commit. Remote `origin/main` == local `HEAD` == `1a9a821`.

**Known doc staleness:** `PROGRESS.md` predates the cross-cutting work — it still lists "apply 0016 (pending)" (done) and flags a Phase-2 "needs a `SECURITY DEFINER` aggregate for PM hours" follow-up that **0018 already implemented**. Trust the migrations/commits over PROGRESS.md; update PROGRESS.md as you go.

---

## 3. The non-negotiable conventions (verified against code)

1. **RLS through `asUser` — everywhere.** Every user-facing query goes through `asUser(uid, sql\`…\`)` (`lib/db.ts:46`), which batches `set_config('app.current_user_id', uid, true)` (transaction-scoped, `is_local=true`) + the query into **one** `sql.transaction([...])` — the Neon HTTP driver is stateless, so the GUC must ride in the same transaction. `fn_me()`/RLS read that GUC. The only no-GUC path is `sqlNoUser` (2 auth-bootstrap lookups). **Never** add a query that isn't `asUser`. The DB is the security boundary, never the UI.
2. **Schema-as-truth — read constraints before writing literals.** Before any INSERT/UPDATE: read the column list, CHECK constraints, enum members, and trigger behaviour from the migrations (not convention). Examples that bit us: `tests.conducted_at` has **no default** (must set `now()`); `tester_role` enum is only `{developer, pm}` (admin → NULL); `time_logs.minutes` CHECK is `> 0` only; `time_logs.project_id/milestone_id` are **trigger-cached** (`fn_cache_spine_pointers`) — never hand-set them.
3. **Archive-only — no DELETE on entities.** "Delete" = `UPDATE … SET archived_at = now()`; base views filter `archived_at IS NULL`. The **only** `DELETE FROM` in `lib/actions/` is on join tables (`*_owners`, `project_members`, `milestone_members`, `task_assignees`, `task_managers`, `*_tags`, `*_lead_sources`) — membership removal, the documented exception. No delete buttons.
4. **No stored derived values.** Money (received/outstanding/%/lifetime) and progress (completion %) are **views/functions** over `payments` + `tasks` (the only written facts). Completion % is by **task count** only; hours never feed it. If you write `UPDATE … SET outstanding = …`, stop.
5. **Role-branched projections (the column wall).** With a single app DB role, column-stripping is enforced **server-side by selecting the view by verified session role**: developer → `v_*_dev` (money/client physically absent); others → `v_*_rollup`. Total-wall entities (contacts/companies/deals/payments) also call `denyDevelopers()` (`lib/guards.ts`) at the top of every page before any fetch. Views over secured tables are `security_invoker = true` (0015) so the inner reads honour RLS too.
6. **Migration apply ritual — owner credential stays human-side.** You write `migrations/NNNN_*.sql`; **you do not run them and never need/print the connection string.** The human applies them in their own terminal:
   ```bash
   OWNER_URL=$(grep -E '^#DATABASE_URL=' .env.local | head -1 | sed -E 's/^#DATABASE_URL=//; s/^"//; s/"$//')
   psql "$OWNER_URL" -v ON_ERROR_STOP=1 -f migrations/NNNN_your_migration.sql
   unset OWNER_URL
   ```
   (`scripts/apply-migrations.sh` does a full ordered replay on a fresh DB.) **Never** put a DB password / secret / connection string in chat, a tool call, or a committed file.
7. **Verification stop-gates (don't skip).**
   - **DB changes** get a throwaway **proof script** run as `app_user` (the `prove-0017.mjs` / `prove-0018.mjs` pattern): a **before-proof** (expect the bug), human applies, **after-proof** (clean PASS), then delete the proof and commit only the migration.
   - **Every change** passes the **four static gates**: `npm run typecheck` (tsc) · `npm run lint` · `npm run test:tokens` (no raw hex/px outside `app/tokens.css`) · `npm run build`.
   - **Frontend** passes the **full Playwright suite** (`npx playwright test`, desktop/tablet/mobile) — 0 failed; the only acceptable yellow is the known inline-edit `waitForResponse` retry-green flake class. Walls are proven as **absence-from-response**, not UI hiding.
   - **Caveat for running the suite:** the suite assumes port **:3000** and `AUTH_URL` must match the server's port. If `:3000` is occupied, run on a dedicated port and pin `AUTH_URL`: `AUTH_URL=http://localhost:3344 PORT=3344 PLAYWRIGHT_BASE_URL=http://localhost:3344 npx playwright test`. Never run two `next dev` from the same project dir (they clobber the shared `.next`). `node scripts/dev-reset-seed.mjs` restores a clean demo seed.

---

## 4. Pending — priority order

1. **Ratings UI** — the `ratings` table has data (seed) but **no write surface** anywhere. Build record/edit on the relevant cockpits, respecting `fn_check_rating_direction` (human person-ratings: admin→pm, admin→dev, pm→dev; AI ratings carry `rating_basis`). Lights `avg_rating` on `v_task/deal/user_rollup`. (This is the natural next cross-cutting step, mirroring steps 1–2.)
2. **Availability UI** — `user_availability` upsert path is unblocked (0017). Build self-edit on the user cockpit (`user_id = fn_me()`, admin edits any); upsert by `(user_id, date)`.
3. **View decisions** (cleanup, not new UI) — resolve the 8 unused views (see §5): drop/document `v_project_progress` (dead), decide on the 3 `*_deep` views, explicitly defer the 5 `*_client` views to Phase 4.
4. **Security rotation** — `AUTH_SECRET` currently equals the `app_user` DB password; both, plus the owner password, were surfaced in chat/IDE historically. Set `AUTH_SECRET` to an independent `openssl rand -base64 32` and rotate both DB passwords.
5. **Deploy** — wire Resend (`AUTH_RESEND_KEY` + DNS, sender `login@growwstacks.com`), set `AUTH_URL` to the real URL, Cloudflare Pages build (`npm run pages:build`), Neon spend cap.

Then (Phase-3/later, team-informed): **dashboard** (none exists — `/` redirects to `/contacts`), **Notes module** (rich-text + per-note attachments, the latter gated on the n8n Drive pipeline), **team look-and-feel polish** across the 8 cockpits, and the **Phase-4 client portal**.

---

## 5. Parked decisions (verbatim / code-grounded — do not silently revisit)

**Locked decisions (from `PROGRESS.md`):**
- **Auth.js, not Neon Auth.** *"Neon Auth = Better Auth beta with open public signup; conflicts with invite-bound internal model + non-UUID ids. Invoke the doc's named Auth.js fallback."* Neon Auth is **left OFF** (do not enable in console).
- **Session cadence:** *"30-day session + 60s re-validation + RLS archive-kill"* — long session = tiny email volume; per-request RLS denies archived users immediately; 60s app re-check bounces them.
- **Client-portal access model (Phase 4, locked now so policies are designed for it):** multi-stakeholder clients = ONE company with MULTIPLE portal-enabled contacts; Phase-4 client RLS must grant project access by **COMPANY MEMBERSHIP + `is_client_portal_enabled`**, not single-contact match. 🚨 *"`fn_is_client_for_project` (0010) currently does a single-contact email match … This must be redesigned in Phase 4"* (resolve client → contact → company → projects whose `company_id` matches; solo clients fall back to direct match). **Do not build Phase 4 now.**
- **Deferred UI backlog (held until deploy, team-informed — do NOT run solo polish loops):** (1) Notes module — a real popup with rich-text editor + per-note attachments (attachments depend on the n8n Drive pipeline, Phase 5); (2) general look-and-feel polish across all 8 cockpits, pending team feedback.
- **Honest schema gaps (no fabrication; each is a small additive migration if wanted):** no `company_rating`, no `last_active_at`/multi-window time rollup, no `payments.sent_date`, deal `probability` is UI-derived, internal task discussion reuses the `slack` channel (no `internal` enum member).

**Architectural calls parked during the cross-cutting work (code-verified, intentionally not changed):**
- **Invoker-aggregate understatement class** — an aggregate subquery inside a `security_invoker` view, over a child whose SELECT policy is narrower than the parent's visibility, understates for some role. **Time: FIXED** by 0018 (gated `SECURITY DEFINER` functions; PM now sees aggregate hours, still no raw rows). The rest left as-is:
  - **`ratings` for `sales` understates to NULL** — `sales` is simply not in `ratings_select`. **Lean-intended** (user/task ratings are internal HR signal); only soft concern is NULL-vs-hidden UX. Not changed.
  - **`payments`/money for `sales` understates off own deals** — `payments_select` deliberately scopes sales to own-deal payments. **Intended** projection. Not changed.
  - **`tests` is faithful** for all roles (`tests_select = fn_can_see(parent)` == parent visibility) — the control proving the class.
- **Unused views (8):** `v_project_progress` (dead — superseded by `v_project_rollup.completion_pct`); `v_contact_{attachments,notes,conversation}_deep` (defined, never consumed); the 5 `*_client` views (`v_project/milestone/task_client`, `v_deliverables_client`, `v_timeline_client`) — correct but blocked on the Phase-4 portal. Decisions deferred (see §4 item 3).
- **Tests INSERT gating (step 2):** milestone tests = **admin/pm only** (`fn_can_edit('milestone')`); task tests = **admin/pm or assigned-developer**. A member developer can READ a milestone's tests but cannot record one (INSERT/SELECT asymmetry). This corrected an over-broad initial assumption — keep the gating tied to `fn_can_edit`.

---

## 6. How to work

- **Two Claudes, distinct roles.** Use chat-Claude (claude.ai) as the **strategist** — scope a step, weigh trade-offs, write the brief. Use **Claude Code** as the **implementer** — it reads the repo, makes the change, and self-verifies. Hand Claude Code a tight, single-step brief; let it run the gates.
- **One verified step per turn.** Each turn = one logical unit that ends green: mini-recon (read the policies/schema before writing) → build → proof script (for DB) → four static gates → full Playwright (for frontend) → commit a scoped set of files → push → confirm `origin` matches. Stop and report on any non-flaky failure or any Phase-A mismatch; don't barrel through.
- **The `.claude/` operating model** (agents: schema/rls/backend/frontend/ai-agent/qa; skills: migration-authoring, rls-policies, polymorphic-tables, component-contracts, agent-authoring, playwright-qa; commands: `/phase-gate`, `/smoke-test`, `/rls-check`) encodes these patterns. It's present locally but **uncommitted** — consider committing it so the conventions travel with the repo.
- **Phase-gated.** One phase at a time (`PLAN.md`); meet exit criteria; update `PROGRESS.md` at the end of every unit. Honesty over green-washing: if a gate is yellow, say which and why.
