# PROGRESS.md — GrowwStacks OS

> **This file is the running log** (newest status first; historical phases below). Doc roles are distinct: **HANDOVER.md** = one-time orientation for a new dev · **PLAN.md** = forward plan · **PROGRESS.md** = running log.

## Current phase: Phase 2 — cross-cutting layer  (Phase 0 ✅ · Phase 1 ✅)

8 entity cockpits live + dev-walls proven (Phase 1 complete). Now building the **cross-cutting layer** — universal-card writes, the small UIs (time-logs ✅, tests ✅; ratings/availability next), projections end-to-end. Database at migration **0018**. `origin/main` == `HEAD`.

### Cross-cutting layer — VERIFICATION LOG

| Step | Commit | What landed | Verification |
|---|---|---|---|
| 0017 (pre-req) | `776d0af` | drop the misfired `trg_touch_updated_at` on `user_availability` (it had no `updated_at` column → any UPDATE threw) | before/after proof as `app_user`; 4 static gates |
| **0** — seed enrich | `1e65fc4` | seed `time_logs`/`tests`/`ratings`/`availability`/`task_managers` through the RLS path (the data those projections were starved of) | row counts + rollup lightup; full Playwright ≥196; 4 gates |
| **0.5** — 0018 | `d15f410` | gated `SECURITY DEFINER` time aggregates → **PM aggregate hours restored** while raw-row wall + `security_invoker` stay intact | before/after proof: PM == admin on all 4 time cells, no collateral; 4 gates |
| **1** — time-logs | `a9e6ce4` | time-log entry + own-log archive on the task cockpit; surface the rollup "Total logged" (full projection only) | self-cleaning Playwright (3 tests × 3 viewports); full suite 0 failed; 4 gates |
| **2** — tests | `1a9a821` | record + archive dev/UAT tests on milestone & task cockpits; live project Tests pane | self-cleaning Playwright (5 × 3); full suite 0 failed; 4 gates |

**Remaining cross-cutting steps (priority order):**
1. **Ratings UI** — record/edit respecting `fn_check_rating_direction` (human person-ratings: admin→pm, admin→dev, pm→dev; AI ratings carry `rating_basis`); lights `avg_rating` on `v_task/deal/user_rollup`.
2. **Availability UI** — self-edit on the user cockpit (upsert by `(user_id, date)`; the path was unblocked by 0017).
3. **View decisions** (cleanup) — drop/document `v_project_progress` (dead, superseded by `v_project_rollup.completion_pct`); decide on the 3 `*_deep` views; explicitly defer the 5 `*_client` views to Phase 4.
4. **Security rotation** — `AUTH_SECRET` currently equals the `app_user` DB password; rotate to an independent secret + rotate both DB passwords.
5. **Deploy** — Resend + DNS, `AUTH_URL`, Cloudflare Pages build (`npm run pages:build`), Neon spend cap.

**Superseded earlier notes in this log:** "⏳ Pending YOUR action: apply 0016" → **applied** (it shipped inside `ebacf89`). The Contacts-slice "Phase 2 follow-up: §5.10 PM aggregate hours needs a `SECURITY DEFINER` aggregate function" → **done by 0018** (`d15f410`).

---

## Phase 0 — Foundations (database) ✅ COMPLETE  *(historical)*

**Status: DONE & VERIFIED** — full apply succeeded on Neon, verify-phase0 all green (incl. fn_milestone_pct=50), and verify-rls (real non-owner role) **all PASS**. All Phase 0 exit criteria met. Next: Phase 1.

---

## What's done

### Migrations (all 13 authored + applied on Neon)
- `0000_extensions` … `0012_seed` — full schema, applied cleanly (after fixes below)
- Location: `migrations/`

### QA infrastructure
- `scripts/apply-migrations.sh` — apply script; run as `DATABASE_URL=... ./scripts/apply-migrations.sh`
- `scripts/verify-phase0.sql` — structural + rollup smoke tests (**all green**)
- `scripts/verify-rls.sql` — **rewritten** to create a non-owner `app_test` role, `SET ROLE` so RLS actually applies, then impersonate each seed user via `app.current_user_id`
- `playwright.config.ts`, `playwright/smoke/` — three-viewport config + Phase 1 plan + passing placeholder

---

## VERIFICATION LOG

### Run 1 — apply + verify-phase0 (✅ green)
- All 13 migrations applied cleanly on a fresh Neon DB.
- `verify-phase0.sql`: all PASS, including `fn_milestone_pct = 50` (1 done / 2 seed tasks), spine-cache trigger, archive filter, polymorphic indexes, HNSW index.

### Run 1 — verify-rls (❌ invalid — owner-bypass artifact)
First RLS run reported every wall open (developer saw companies/contacts/deals/payments 1/2/1/1; PM confirmed a payment; finance inserted a project).
**Root cause: connecting as `neondb_owner`.** Postgres does not apply RLS to a table's owner unless `FORCE ROW LEVEL SECURITY` is set (we use `ENABLE`, correct for production). Setting `app.current_user_id` as the owner sets the GUC but the policies are never evaluated. **All four failures were this single artifact**, not policy bugs:

| Reported failure | Verdict | Why |
|---|---|---|
| developer sees companies/contacts/deals/payments | **Artifact** | No developer-permitting SELECT policy exists on those 4 tables; RLS enabled → 0 rows once RLS applies |
| PM confirmed a payment | **Artifact** | `payments_update WITH CHECK` blocks `status IN ('confirmed','in_team_accounts')` for non-finance/admin |
| finance inserted a project | **Artifact** | `projects_insert WITH CHECK (role IN ('admin','pm'))` — finance excluded |
| sales-INSERT hit duplicate-key, not RLS block | **Real bug** (seed seq collision — fixed) | see below |
| credentials seeded (0) | **Real gap** (fixed) | no sample credential to test column-denial |

### Genuine fixes applied this session
1. **`fn_audit` jsonb-diff** (0007) — referenced undefined aliases (`old_obj`/`new_obj`); rewritten as a join over `jsonb_each(OLD)`/`jsonb_each(NEW)`. Would have errored on every audited UPDATE.
2. **`users_update` RLS** (0010) — `WITH CHECK` referenced `OLD` (illegal in RLS); replaced with a `fn_prevent_role_escalation` BEFORE-UPDATE trigger that blocks non-admin role/status changes.
3. **Idempotency** (0010, 0011) — every `CREATE POLICY` now preceded by `DROP POLICY IF EXISTS` (94 policies) so re-apply doesn't error.
4. **Seed UUID** (0012) — invalid-hex `g0000000…` payment id → `cafe0000…`.
5. **Seed sequence collision** (0012) — seed set `display_id` explicitly, so `fn_assign_display_id` never advanced the sequences; the first trigger-generated id would collide (`pr-0001` duplicate). Added data-derived `setval()` reconciliation for all 7 sequences. **This would have broken the first real app insert in Phase 1.**
6. **Sample credential** (0012) — added one `credentials` row (base64 pgcrypto ciphertext in `secret_ref`) + `credential_links` to contact and the seed project, so the column-denial test has a row to bite on.
7. **`apply-migrations.sh`** — replaced bash-4 `mapfile` with a 3.2-compatible read loop (macOS).

### Run 2 — verify-rls (rewritten, real non-owner role) — ✅ ALL PASS
Re-applied `0012_seed.sql` (credential + setval), then ran `verify-rls.sql` as `app_test` (non-owner). All checks PASS:
- developer: 0 companies / 0 contacts / 0 deals / 0 payments; sees 1 member project, 2 tasks, 1 linked credential (metadata); `secret_ref` column denied
- admin: sees all entities; `secret_ref` column denied even to admin (reveal action is the only path)
- sales: sees all contacts; project INSERT blocked by RLS
- finance: sees payments; project INSERT blocked by RLS
- PM: cannot set `status='confirmed'` (WITH CHECK blocked); finance CAN confirm; 0 raw time_logs rows (rollup-views-only)

**Conclusion: every wall in the §6.2 capability matrix enforces at the database layer under a non-owner role. Phase 0 verified complete.**

---

## Phase 0 exit criteria status

- [x] All migrations apply cleanly on a fresh Neon database (apply succeeded after fixes)
- [x] RLS verified per role against the capability matrix — `verify-rls.sql` (real non-owner role) **all PASS**
- [x] Polymorphic validate + spine-cache triggers proven (`verify-phase0.sql` green)
- [x] Rollup views return correct numbers against seed data (fn_milestone_pct = 50%)
- [x] No DELETE anywhere; archive filter works (verified in smoke test)
- [x] PROGRESS.md updated ← this update

**🎯 Phase 0 COMPLETE — all exit criteria green.**

---

## 🔐 AUTH DECISION — Auth.js (ARCHITECTURE.md deviation, deliberate)

**Decision (locked):** Use **Auth.js** for authentication, NOT Neon Auth. **Neon Auth is left OFF.**

**ARCHITECTURE.md deviation flagged:** [ARCHITECTURE.md:33](docs/ARCHITECTURE.md#L33) names **Neon Auth (Stack-Auth-based)** as the locked auth, with *"Fallback if any edge-runtime issue on Cloudflare: Auth.js — architecture is identical either way."* We are **invoking that named fallback**, for reasons beyond edge-runtime:
1. The Neon Auth console shows it is **Beta**, and **powered by Better Auth** — *not* Stack Auth as the doc states. The doc's premise is factually outdated.
2. Neon Auth currently allows **open public signup** ("Anyone on the web can sign up… restricted signups coming soon"). This **conflicts with the locked invite-bound model** (Golden Rule 6: access bound to known emails; archiving the email kills access). An internal tool for ~40 staff must not allow anonymous signup.
3. **Better Auth default user ids are non-UUID strings** → would break `fn_me()::uuid`. With Auth.js we mint `gen_random_uuid()` ourselves, so `public.users.id` is a real UUID and the cast holds.
4. The original Neon Auth selling point (auto-sync into Postgres) is **moot** under single-app-role + GUC — RLS reads `public.users`, not the sync mirror.

**Why Auth.js fits:** invite/allowlist control at the front door (matches the email-bound model), self-owned (no lock-in, host-portable), UUID ids we control. This is a conscious, documented deviation — ARCHITECTURE.md itself is left unedited (read-only per CLAUDE.md); this record is the authoritative note.

### Session + revocation cadence (LOCKED)
Goal: **long session for low email volume** AND **departed employee locked out within minutes**. Achieved with two decoupled layers:

- **Layer 1 — Database (hard guarantee, immediate, automatic):** Every query goes through the `asUser(uid, query)` helper → sets the GUC → RLS calls `fn_my_role()` = `SELECT role FROM users WHERE id = fn_me() AND archived_at IS NULL`. **The instant an admin archives a user, their very next query resolves `fn_my_role()` → NULL → no policy matches → deny-all (read AND write).** No token expiry needed; this is automatic and immediate. ✅ **Archive-kills-access path confirmed.**
- **Layer 2 — App-layer re-validation (clean bounce, ≤60s cadence):** JWT session `maxAge = 30 days` (so magic-link email volume stays ~monthly). The Auth.js `jwt` callback stamps `lastChecked`; when `now - lastChecked > 60s` it re-queries `SELECT 1 FROM users WHERE id = uid AND archived_at IS NULL AND status <> 'left_org'`. On miss → session invalidated → redirect to login. Cost: one tiny indexed query per active user per minute.

**Net:** data access denied on the **next request** (Layer 1); full logout/redirect within **≤60s** (Layer 2); session lasts 30 days so login emails stay tiny. **The authoritative revoke action is ARCHIVE THE USER** (RLS-enforced) — do not rely on `status='left_org'` alone for security (it only triggers Layer 2, not the RLS hard wall). Optional later hardening: extend `fn_my_role()` to also exclude `left_org` (a migration) if we want that status to be an RLS-level kill too.

### Phase 1 backend-agent scope additions (folded in)
- **`migrations/0014_auth_tables.sql`** — `auth` schema + `verification_token` table for Auth.js Email provider; **grants to `app_user`** (same non-owner discipline as 0013). JWT session strategy (no session table).
- **`signIn` allowlist callback (MATCH-ONLY)** — reject sign-in unless the email matches an **active `public.users` row**; on pass, put that `users.id` (UUID) in the JWT as `uid`. **No auto-insert on login** — staff are invite-only, provisioned by an authenticated admin action (the seed `admin@growwstacks.com` is the bootstrap). Auto-insert would also fail RLS (`users_insert` requires `fn_is_admin()`). The allowlist lookup itself runs fine with no GUC because `users_select` is `USING(true)`. Phase 4 extends the allowlist to portal-enabled contacts (see client-portal note below).
- **`asUser(uid, query)` GUC helper** — transaction-scoped `set_config('app.current_user_id', uid, true)` batched with the query (HTTP driver is stateless; `is_local=true` prevents cross-request leak). **Single mandatory entry point for ALL queries.**

### Email (Resend)
- Provider: **Resend** (free tier 3,000/mo — ample at ~monthly login cadence). Edge-compatible HTTP API (Nodemailer is NOT edge-safe — excluded).
- Sender: `login@growwstacks.com` (own domain). Manish creates the account + API key (`AUTH_RESEND_KEY`) **when I signal I need it**; I'll specify the exact SPF/DKIM DNS records for deliverability at that point.

---

## 📋 CLIENT PORTAL ACCESS MODEL — Phase 4 (decision locked NOW so policies are designed for it)

- **Company stays OPTIONAL on contacts** (solo clients have none — unchanged).
- **Multi-stakeholder clients = ONE company with MULTIPLE portal-enabled contacts.**
- **Phase 4 client-portal RLS must grant project access by COMPANY MEMBERSHIP + `is_client_portal_enabled`** — NOT by single-contact match — so a client's PM, owner, and tester all see the same project / milestones / deliverables / timeline.
- 🚨 **`fn_is_client_for_project` (0010) currently does a single-contact email match** (`c.email = (SELECT email FROM users WHERE id = fn_me())`). **This must be redesigned in Phase 4** to: resolve the logged-in client to their contact → contact's company → grant access to projects whose `company_id` matches, for any portal-enabled contact in that company. Solo clients (no company) fall back to direct contact match. Do NOT build Phase 4 now — this is the design constraint recorded so the successor function is built for the multi-contact case from the start.

---

## Known issues / decisions / deviations

- 🚨 **Production app role + grants is a Phase 1 prerequisite.** RLS only applies to NON-owner roles. The app must connect as a dedicated non-owner role (not `neondb_owner`), or RLS is silently bypassed. `verify-rls.sql` models this with an `app_test` role; Phase 1 needs a real grants migration that mirrors it.
- 🚨 **`secret_ref` must be granted column-by-column, never table-level.** A table-level `GRANT SELECT` on `credentials` would override the column REVOKE (Postgres allows a column if EITHER table- or column-level SELECT is present). The Phase 1 grants migration must `GRANT SELECT (…all columns except secret_ref…)`, exactly as `verify-rls.sql` does. The `REVOKE SELECT (secret_ref)` statements in 0010 are only effective because no role currently holds table-level SELECT.
- **Re-apply needed before re-running RLS:** `0012_seed.sql` changed (credential + setval). Re-run the apply script (idempotent) or at least re-apply `0012` before `verify-rls.sql`.
- `audit_log` entity_type for `credentials`/`ai_actions`/`attachments` reuses `contact`/`task`/`note` (no dedicated enum members). Documented in 0011; extend `entity_type` in a later phase if needed.

---

## 🎨 BASE REDESIGN — ✅ DONE (all 8 entities, list + detail, cockpit pattern)

Autonomous overnight run. Every entity's **list + detail** rebuilt pixel-faithfully to the Claude Design handoff (`design/handoff/ui_kits/internal/*.html`), on the approved **Contacts cockpit** pattern, wired to real data + RLS, all role-branches/dev-walls preserved.

- **Reference:** Contacts list + detail cockpit (approved by Manish).
- **Shell:** `app/design-shell.css` (ported chrome) + `app/design-compat.css` (token aliases incl. channels + next/font wiring) + role-aware sidebar. **Mobile breakpoint** added (≤640px collapses sidebar + stacks cockpit).
- **Fonts:** fixed — self-hosted via **next/font** (Bricolage Grotesque / Hanken Grotesk / IBM Plex Mono), no system fallback. Token root confirmed = real Quiet Signal values.
- **Entities done:** Contacts ✓, Companies ✓ (People panel), Deals ✓ (Kanban board + List toggle, convert-to-project), Projects ✓ (full + **developer-view** cockpits, role-branched), Milestones ✓ (read-only task-count completion), Tasks ✓ (dev-safe, kanban-status auto-save), Payments ✓ (lifecycle rail, **finance-gated confirm**), Users ✓ (directory, availability/workload, **admin-only role/status** keystone).
- **Verification:** full Playwright suite **197/199 passing** across desktop/tablet/mobile. The 2 "failures" are `next dev` compile-under-load flakiness (both **pass in isolation, 32/32**) — not app bugs. tsc/lint/build/tokens all green. RLS dev-walls, finance-confirm gate, and role-escalation keystone all preserved & green.
- **Screenshots** for review: `playwright/redesign-shots/{entity}.png` (14 screens, admin/full projection). Live: `AUTH_URL=http://localhost:3210 PORT=3210 npm run dev` → `http://localhost:3210/api/dev-login` (or `?role=developer` to see the stripped projections).

### ⏳ Pending YOUR action (couldn't do autonomously)
- 🔑 **Apply 0016** (`job_title`) in your terminal: `psql "$OWNER_URL" -f migrations/0016_contact_job_title.sql`. The migration boundary correctly blocked me from using the owner credential. Once applied, wiring it into the Contact header sub-line + Company People-panel "role" line is a ~3-line change (I removed the premature references so the pages don't 500 meanwhile).
- 🔐 **Rotate secrets** (AUTH_SECRET == app_user DB password; both + owner pw surfaced in chat).

### 📋 Deferred UI backlog — Phase 3 deploy-time pass (team-informed)
Held deliberately until Resend + Cloudflare are wired and the team can log in and react to the working app. **Do NOT run solo polish loops on these** — they wait for team feedback.
1. **Notes module — small BUILD (not a restyle):** a proper popup/modal with a **rich-text editor** (the constrained-Markdown shell is light — bold/italic/underline/H1–H3 per ARCHITECTURE §14) + **per-note attachments**. ⚠️ Note-attachments depend on the **n8n Google-Drive upload pipeline (Phase 5)** — build the editor + note shell first; wire note-attachments when the upload path lands.
2. **General look-and-feel polish across all 8 cockpits** — spacing/hierarchy/interaction refinements, pending **team feedback** at the Phase 3 deploy. The 8 screens are approved structurally and functionally as-is; this is the cosmetic finishing pass once real users react.

### job_title (0016) — ✅ WIRED (pending the migration apply)
`job_title` is wired into the Contact header sub-line ("role · company · Created · Updated"): `getContact` joins `contacts.job_title`, the `ContactRollup` type carries it, the header renders it when present. tsc/lint/build/tokens green. **Runtime needs migration 0016 applied** (owner-only) — see the command in the chat. Until applied the contact detail would error on the `c.job_title` join; once applied it renders.

### 🔒 Developer-wall hardening (route layer) — fix
The total-wall entities (Contacts/Companies/Deals/Payments) previously relied ONLY on RLS-returning-empty — no explicit route-level developer-deny. Secure on a fresh render, but a stale client-side router-cache entry (admin render reused after a same-tab role switch) could re-serve content while the sidebar re-rendered as developer. **Fix:** `lib/guards.ts` `denyDevelopers()` called at the TOP of all 8 list+detail pages (before any fetch) → developer gets the not-found page, server emits no data. RLS remains the underlying data wall (proven: every developer query returns 0). NO migration needed (RLS/views were already correct). Dev-wall Playwright tests updated to assert the route wall (list surface + data absent; notFound on a streamed edge RSC commits a 200 status, so the assertion is data/surface-absence, not the status code). All-entity developer probe re-confirmed: total-wall = 0, partial-wall = member-only with money/client columns stripped.

### Notes for the morning review
- `scripts/dev-reset-seed.mjs` — restores a tidy demo seed (the inline-edit/status/add-member tests mutate seed rows). Run it before a manual walkthrough.
- Demo data seeded for Alice (conversation/insights/note) so the Contact cockpit shows real content; related projects/deals/tasks come from the real seed spine.
- Honest schema gaps flagged per screen (no fabrication): no `company_rating`, no `last_active_at`/multi-window time rollup, no `payments.sent_date`, deal `probability` is UI-derived, internal task discussion uses the `slack` channel (no `internal` enum member). Each is a small additive migration if you want it.

## Phase 1 progress (IN FLIGHT)

### Backend foundation — ✅ BUILT & AUDITED (compile/typecheck/lint/build green; DB-run pending)
- **Scaffold:** Next.js App Router + TS + Tailwind(→CSS-var tokens) + @cloudflare/next-on-pages + Neon serverless driver, npm. App at repo root. `tsc --noEmit`, `next lint`, `next build` all pass.
- **`lib/db.ts`** — `asUser(uid, query)` batches `set_config('app.current_user_id', uid, true)` + the query in ONE `sql.transaction([...])` (audited: is_local=true, transaction-scoped, no cross-request leak). `sqlNoUser` is the only no-GUC path (2 documented auth-bootstrap lookups; safe via `users_select USING(true)`).
- **`lib/auth.ts`** — Auth.js v5, JWT 30-day session, Resend magic-link, signIn MATCH-ONLY allowlist, jwt ≤60s revalidation (returns null on archived/left_org → session kill). `getCurrentUserId()` feeds `asUser`.
- **`migrations/0014_auth_tables.sql`** — `auth.verification_token` + grants to `app_user`; no RLS (infra token table, justified inline).
- **`lib/actions/contacts.ts`** — list/get/create/updateContactField(single-col PATCH, allowlisted)/archive(not delete)/owner add-remove/lead-source add-remove. All via `asUser`; reads `v_contact_rollup`; DELETE only on the two join tables.
- **`middleware.ts`** — protects routes; redirects unauthenticated to `/login`.

### ⏳ Verify before relying on it
- 🔎 **jwt-return-null invalidation (Auth.js v5):** the ≤60s Layer-2 bounce returns `null` from the `jwt` callback to kill the session. Confirm this reliably clears the cookie in v5 across flows. **If it doesn't, the security property still holds** — Layer 1 (RLS) already denies an archived user all data on the next request; the worst case is an archived user keeps an empty-looking session until token expiry. Harden the UX bounce with a middleware active-check if needed.

### Contacts vertical slice — ✅ BUILT & VERIFIED (Playwright green end-to-end, RLS-proven)
- **Tokens compiled:** `scripts/build-tokens.mjs` → `app/tokens.css` (205 root + 53 dark). `tailwind.config.ts` extended (surface/text tiers, accent/success/warning/danger/info, status/timeline/ai). Fonts wired. `next build` green.
- **Frontend (frontend-agent):** app shell (dark sidebar + theme toggle), `/login` (magic-link), `/contacts` list (filters, status pills, rating badges), `/contacts/[id]` detail (field-level auto-save via `updateContactField`, multi-owner, lead sources, archive-not-delete), 4 universal polymorphic cards (generic over parent_type/parent_id) + `lib/actions/polymorphic.ts` (all via `asUser`). tsc/lint/build green; **tokens-only grep clean** (no hex/px outside tokens.css).
- **QA (qa-agent):** Playwright specs incl. the developer-projection wall; session-cookie minting via `next-auth/jwt encode` (crypto round-trip verified vs real AUTH_SECRET; wrong-salt rejected; no app-code auth bypass). testid contract verified aligned between frontend + specs.
- 🚨 **CRITICAL CONFIG BUG (caught by live probe):** `.env.local` `DATABASE_URL` connects as **`neondb_owner`**, not `app_user`. Probe: `contacts` with no GUC returned **2 rows (expected 0)** — RLS is being BYPASSED. This violates Phase 1 exit-criterion #1. **The app must connect as `app_user` (non-owner) or every RLS wall is silently open.** MUST be fixed before any RLS-dependent test or deploy. Once `DATABASE_URL` uses `app_user`, re-run the probe (expect `app_user` + `contacts noGUC = 0`), then the Playwright dev-wall.

### VERIFICATION LOG — Contacts slice (Playwright, driven by Claude)
Ran the suite on an isolated port (3100; your other app holds 3000). Progression of real bugs caught and fixed:

1. **Auth: MissingAdapter** — Auth.js's Email/magic-link provider requires an adapter even under JWT sessions; `lib/auth.ts` had none → every `auth()` threw → all pages 500'd. **Fixed:** added an edge-safe adapter (verification-token methods + user-lookup mapped to `public.users`, invite-only `createUser` that never auto-provisions). `auth()` works; unauth `/contacts` now 302s to `/login`.
2. **🚨 CRITICAL — views bypass RLS** (caught by the developer-projection wall): the developer saw **2 contacts through `v_contact_rollup`** while the `contacts` table correctly returned 0. Postgres views run as their **owner** (`neondb_owner`, who bypasses RLS) unless created `WITH (security_invoker = true)`. **ALL 23 views leaked** — every rollup AND the developer-safe/client-safe projections. Phase 0's `verify-rls.sql` only tested tables, so it missed this. **Fixed by `migrations/0015_view_security_invoker.sql`** (flips `security_invoker=true` on every public view; PG17 supports it). ⛔ **Must be applied by owner before the slice verifies.**
   - ⚠️ Phase 2 follow-up: §5.10's "PMs read aggregate hours via rollup views (not raw time_logs)" relied on the view-owner bypass. With RLS-honoring views, that needs a dedicated SECURITY DEFINER aggregate function. No Phase 1 impact (no time_logs yet).
3. **Row navigation** — clicking a contact row didn't open the detail (only the name cell linked). **Fixed** with the stretched-link pattern (whole row clickable).

**FINAL Playwright status (after 0015 + fixes): ✅ 31 passed, 2 skipped, 0 failed.** The 2 skips are intentional (tokens-only static check runs once on desktop). Verified end-to-end through the real browser across desktop/tablet/mobile:
- 🚨 **Developer-projection wall PASSES** — a genuinely-authenticated developer reaches 0 contacts via the app (list + direct detail route), and the seed contact's data never appears. RLS enforced through the real app path, including views.
- Admin: list renders seed rows, row→detail nav, **inline field-level auto-save** fires a real server-action POST and shows "Saved", 4 universal cards render, owner-add works.
- Unauthenticated → redirect to /login; tokens-only static check clean; 9 responsive screenshots captured (login/list/detail × 3 viewports) in `playwright/screenshots/`.
- Bugs fixed along the way: auth adapter (#1), **view RLS leak / 0015** (#2), row-nav stretched-link (#3), and a test-scoping bug (field-status matched all fields). One test-bug, three real bugs — all resolved.

**Also surfaced (env, fixed):** Playwright `reuseExistingServer` grabbed your stray app on :3000 → run on :3100 with `AUTH_URL` overridden to match. For real magic-link later, `.env.local` `AUTH_URL` must match the actual dev/deploy URL.

### Batch A — Companies + Deals — ✅ BUILT & VERIFIED (parallel, green first run)
Built in parallel (two agents, disjoint files) mirroring the Contacts template. Full suite (Contacts + Companies + Deals × 3 viewports): **73 passed, 2 skipped, 0 failed.**
- **Companies** (`/companies`): list/detail/create/inline-auto-save/archive; single-FK `account_owner_id` (no owner join — the one structural difference); reads `v_company_rollup`; cards reused. **Dev-wall PASS** (developer sees 0).
- **Deals** (`/deals`): list/detail/create/inline-auto-save/archive; multi-owner (`deal_owners`) + tags (`deal_tags`); billing card from `v_deal_billing`; reads `v_deal_rollup`. **Dev-wall PASS** (developer sees 0).
- Parallel-safety held: both edited `Sidebar.tsx` (one line each, both nav items active, no clobber); combined tsc/lint/build green. No new migrations (existing views, already `security_invoker` via 0015).
- **Batching strategy validated**: with foundational bugs fixed system-wide, close-mirror entities build + verify in parallel with only a per-batch gate. Each still ships its own dev-wall test.

### Batch B — Projects — ✅ BUILT & VERIFIED (partial dev-projection proven)
DB-layer probe FIRST (per Manish): confirmed field-by-field that `v_project_dev`/`v_milestone_dev`/`v_task_dev` physically strip money/client columns (deal_id/contact_id/company_id, price/currency, billing) while exposing delivery (status/dates/hours/completion/schedule); all are `security_invoker=true`. **Key model note:** in single-app-role, column-stripping is enforced **server-side by selecting the view by verified session role** (developer → `v_*_dev`; others → `v_*_rollup`), backed by DB row-RLS — Postgres column-grants can't distinguish users sharing `app_user`. Optional future hardening: NULL sensitive cols in the rollup when `fn_my_role()='developer'` (defense-in-depth).
- **Projects** (`/projects`): role-branched read actions (developer never gets rollup/billing); `project_members` multi-PM/dev; create=admin/pm only; billing (non-dev) from `v_project_billing`; completion from `v_project_progress`. Read-only milestone summary (full M/T UI = next slice).
- `lib/auth.ts` gained `getCurrentUserRole()` (additive).
- Full suite (Contacts+Companies+Deals+Projects × 3 viewports): **94 passed, 2 skipped, 0 failed.** Both **partial dev-walls PASS**: developer sees the member project (delivery only), NO billing card, NO client/value — list AND detail.
- **Bug fixed (latent, system-wide):** the neon driver returns `date`/`timestamptz` columns as **Date objects**, but `InlineDate` called `value.slice()` → client-side crash on any populated date. Fixed in `components/projects/InlineField.tsx` AND `components/deals/InlineField.tsx` (Deals dodged it only because the seed `close_date` was null). **Milestones/Tasks agents MUST use the Date-safe InlineDate** (they have many date fields).
- ⚠️ **Latent date tz nuance (flagged, not blocking):** `new Date(value).toISOString().slice(0,10)` can be off-by-one for `date` columns stored at non-UTC midnight (e.g. IST). Proper fix later: normalize `date` columns to `YYYY-MM-DD` strings at the action layer (tz-free). Tests don't assert exact dates, so green stands; correctness follow-up noted.

### Batch B cont. — Milestones + Tasks — ✅ BUILT & VERIFIED (parallel)
Built in parallel off the proven Projects projection. Full suite (all 6 entities × 3 viewports): **139 passed, 2 skipped, 0 failed.**
- **Milestones** (`/milestones`): role-branched (developer → `v_milestone_dev`, strips price/currency/client); `milestone_members` multi; billing (non-dev) from `v_milestone_billing`; completion from `v_milestone_progress`; Date-safe InlineDate. **Partial dev-wall PASS** (developer sees M1 delivery, no price/client/billing).
- **Tasks** (`/tasks`): role-branched (developer → `v_task_dev`, strips contact/company); **kanban-status auto-save** (InlineSelect → server action → Saved); multi-assignee (`task_assignees`) + multi-PM (`task_managers`); Date-safe InlineDate (4 date fields). Developers get *editable* fields (RLS `fn_can_edit('task')` allows assignees — correct per spec). **Partial dev-wall PASS** (developer sees both assigned tasks, no client identity, no billing).
- **Bug fixed (test isolation, not app):** the inline-edit tests mutate the seed record's name/title to a timestamped value; other tests filtered rows by that now-stale text → racy failures across viewports. **Fixed by keying row-finders off the stable `display_id`** (T-1/T-2, M1) instead of mutable name/title. Applied to tasks + milestones specs. **Lesson for Batch C specs: always locate rows by display_id, never by an editable field's value.** Seed display names reset to clean post-run.

### 🎯 6 of 8 entities live & RLS-verified
Contacts · Companies · Deals · Projects · Milestones · Tasks — all with dev-walls (total or partial) proven through the real app path. 139 tests green.

### Batch C (next, gated): Payments + Users
- **Payments** (`/payments`): money facts only; **finance/admin-only confirm** (the `confirmed`/`in_team_accounts` WITH CHECK); developer dev-wall = 0; sales create-unconfirmed only. Distinct lifecycle (status: due→overdue→client_paid→received→confirmed→in_team_accounts). Reads `v_*_billing` context. Spec must test: finance CAN confirm, PM CANNOT (WITH CHECK block).
- **Users** (`/users`): directory (everyone reads, `users_select USING(true)`); self-edit own profile; **only admin sets role/status** (the `fn_prevent_role_escalation` trigger); no archive-from-list delete in the usual sense (archive = revoke access). Spec must test: non-admin cannot change own role (trigger blocks).

### Deferred (not blocking entity work)
- 🔐 **Rotate secrets**: `AUTH_SECRET` currently equals the `app_user` DB password (both, plus owner pw, surfaced in chat/IDE). Set `AUTH_SECRET` to an independent `openssl rand -base64 32`; rotate both DB passwords.
- Before real magic-link: apply `0014`, set `AUTH_RESEND_KEY` + DNS, make `.env.local` `AUTH_URL` match the real URL.

### Next in Phase 1 (gated on inputs)
- **Contacts frontend** (list/detail/cards/inline-edit/multi-owner) — **BLOCKED on `design/tokens.json`** (frontend-agent builds once tokens land).
- **0014_app_role-style grants migration already covered by 0013**; 0014 (auth tables) is the only new migration to apply.
- **`/login` page + Resend wiring** — needs `AUTH_RESEND_KEY` + DNS (Manish, when signalled).

## What's next

Phase 1 continues: Contacts frontend (on tokens), then replicate the vertical slice across companies/deals/projects/milestones/tasks.

Credentials needed for Phase 1:
- `DATABASE_URL` — Neon connection string using the **`app_user`** role (✅ 0013 applied, password set)
- `AUTH_SECRET` — Auth.js session secret (generate)
- `AUTH_RESEND_KEY` — Resend API key (Manish creates when signalled; sender `login@growwstacks.com`)
- `AUTH_URL` — app base URL
- `N8N_DRIVE_WEBHOOK_URL` + `N8N_DRIVE_WEBHOOK_SECRET` — file upload proxy (later in Phase 1)
- ~~`NEXT_PUBLIC_STACK_PROJECT_ID` / `STACK_SECRET_SERVER_KEY`~~ — **DROPPED; Neon Auth not used (see Auth Decision above)**

---

## Decisions log

| Decision | Rationale |
|---|---|
| migrations/ at project root | Standard convention; human runs psql directly |
| Playwright configured in Phase 0 | CLAUDE.md mandates early setup so Phase 1 self-verifies without human involvement |
| verify-rls.sql uses seed UUIDs | Fixed UUIDs in seed make impersonation tests deterministic |
| verify-phase0.sql uses SKIP for absent seed data | Better to skip with a NOTICE than fail when seed is minimal; tighten in Phase 1 |
| **Auth.js, not Neon Auth** | Neon Auth = Better Auth beta with open public signup; conflicts with invite-bound internal model + non-UUID ids. Invoke the doc's named Auth.js fallback. See Auth Decision section. |
| **30-day session + 60s re-validation + RLS archive-kill** | Long session = tiny email volume; per-request RLS denies archived users immediately; 60s app re-check bounces them. Decoupled cadence. |
| **Neon Auth left OFF** | Do not enable in console; open signup is unacceptable for a ~40-staff internal tool. |
