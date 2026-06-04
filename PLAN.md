# PLAN.md — GrowwStacks OS Development Plan

The phased plan. Claude Code reads this to know the current phase and its scope. **One phase at a time; meet the exit criteria before advancing.** Update the "CURRENT PHASE" marker as you progress; record actual status in PROGRESS.md.

> **CURRENT PHASE: Phase 2 — Payments + projections + completeness.** (Phase 0 ✅ schema live on Neon + RLS-verified · Phase 1 ✅ all 8 entity cockpits live + dev-walls proven.) The active sub-stream is the **cross-cutting layer** (universal-card writes, the small UIs, projections end-to-end); migrations are at **0018**. Step-by-step status + remaining steps live in PROGRESS.md (the running log) — this file stays the forward plan.

---

## Sequencing principle

The **database** and the **design system** are independent foundations and run in **parallel** (design happens in Claude Design on the web; DB happens here in Claude Code). **App functionality depends on both** and starts only once they're locked. The **AI layer** depends on functionality emitting real data. So:

```
Phase 0:  [ DB migrations ]  ‖  [ Design system + screens (Claude Design, separate) ]
Phase 1:  Core functionality (spine: contacts→companies→deals→projects→milestones→tasks)
Phase 2:  Payments + universal modules wired + auto-save + the three projections
Phase 3:  AI layer (multi-agent supervisor, propose-confirm, embeddings, timeline, digests)
Phase 4:  Client portal
Phase 5:  Ingress/egress (n8n in/out), hardening, ETL of existing Airtable projects
```

---

## Phase 0 — Foundations (database) ✅ COMPLETE

**Goal:** the complete schema live on Neon, RLS-enforced, with seed data. (Design system proceeds in parallel via Claude Design — not Claude Code's job.)

**Scope (author as numbered migrations — see ARCHITECTURE.md §17):**
- `0000_extensions` — pgcrypto, pgvector
- `0001_enums` — every enum in ARCHITECTURE.md §5.12
- `0002_core_tables` — companies, contacts, deals, projects, milestones, tasks (+ display-id sequences/counters)
- `0003_ownership_joins` — contact_owners, deal_owners, project_members, milestone_members, task_managers, task_assignees; lead/tag joins (contact_lead_sources, deal_tags)
- `0004_polymorphic` — attachments, notes, conversation_entries, ai_insights, ratings
- `0005_supporting` — users, user_availability, payments, credentials, credential_links, credential_access_log, tests, time_logs, apps, app_links
- `0006_ai_layer` — ai_actions, sop_documents, project_timeline_events, digests, embeddings (vector(512), HNSW)
- `0007_triggers` — fn_validate_parent, fn_cache_spine_pointers, fn_backfill_company_on_contact, fn_touch_updated_at, fn_assign_display_id, fn_check_rating_direction, fn_audit, fn_orphan_sweep
- `0008_rollup_views` — fn_is_received, fn_milestone_pct, fn_project_pct, fn_schedule_state, v_*_billing, v_*_progress, v_*_rollup, deep views
- `0009_projections` — v_*_dev (developer-safe), v_*_client (client-safe)
- `0010_rls` — enable RLS on all tables; helpers (fn_me, fn_my_role, fn_is_admin, fn_can_see/edit dispatchers); the full §6.2 capability matrix
- `0011_audit` — audit_log + wiring
- `0012_seed` — enums sanity, apps catalog, a few users, SOP stubs

**Exit criteria:**
- [ ] All migrations apply cleanly on a fresh Neon database (human runs them in their terminal).
- [ ] RLS verified: a test query as each role returns only what the matrix allows (especially: developer sees NO companies/contacts/deals/payments; sales cannot create projects; only finance confirms payments; PM sees aggregate hours not raw rows).
- [ ] Polymorphic validate + spine-cache triggers proven with insert tests.
- [ ] Rollup views return correct numbers against seed data (billing attribution, task-count completion).
- [ ] No DELETE anywhere; archive filter works.
- [ ] PROGRESS.md updated with the schema-built state.

## Phase 1 — Core functionality (the spine) ✅ COMPLETE

**Goal:** CRUD + list views + detail pages for contacts, companies, deals, projects, milestones, tasks, on the locked schema and the locked design system.

**Scope:** server actions (edge-safe, Neon serverless driver) for read/list/create/field-level-update (NOT delete — archive); list pages with filters (status/owner/PM/dev/app/schedule per ARCHITECTURE.md); detail pages assembled from the rollup views; the universal cards wired (attachments/notes/conversation/ai-insights as polymorphic reads); inline field-level auto-save; multi-owner UI (assign multiple PMs/devs/owners).

**Exit criteria:**
- [ ] 🚨 **Production non-owner app role + grants migration.** The app MUST connect as a dedicated non-owner Postgres role (never `neondb_owner`), or RLS is silently bypassed in production (proven in Phase 0). Author a grants migration (`0013_app_role` or similar) that creates the role and grants `SELECT/INSERT/UPDATE/DELETE` per the capability matrix, with **`credentials.secret_ref` handled column-by-column** (grant every column EXCEPT `secret_ref` — a table-level `GRANT SELECT` would override the column REVOKE). Mirror exactly what `scripts/verify-rls.sql` does for `app_test`. The connection string in `.env.local` must use this role. **Verify**: connect as the app role and re-run `verify-rls.sql` semantics — all walls must hold.
- [ ] Each spine entity: list + detail + create + inline-edit working, RLS-respected.
- [ ] Universal polymorphic cards render on each detail page from one component each.
- [ ] Auto-save proven (single-field PATCH, no full-form save).
- [ ] Multi-owner assignment works (add/remove multiple owners/PMs/devs).
- [ ] UI-verification passed for every screen (tokens only, renders, responsive).
- [ ] PROGRESS.md updated.

## Phase 2 — Payments + projections + completeness  ⟵ CURRENT (cross-cutting layer in progress)

**Goal:** the money layer and the role projections fully live.

**Scope:** payments CRUD with the status lifecycle (only finance confirms); billing rollups surfaced on deal/project/milestone; payment→deal/project/milestone attribution; the developer-safe and client-safe projections enforced end-to-end (a developer literally cannot load money/client fields); tests + ratings + time_logs UIs (PM aggregate hours; dev own time; directional ratings).

**Exit criteria:**
- [ ] Payment lifecycle + confirmation control by finance only.
- [ ] Billing rollups correct at all three levels; no stored money.
- [ ] Developer-safe view proven (no finance/client data reachable as a developer, via API not just UI).
- [ ] Tests (3 dev/3 UAT min surfaced), ratings (directional + AI-ready), time_logs (aggregate vs own) working.
- [ ] PROGRESS.md updated.

## Phase 3 — AI layer (the core differentiator)

**Goal:** the multi-agent supervisor running as Cloudflare Workers+Cron, model-agnostic via OpenRouter (Kimi-tier triage + stronger judgment), propose-confirm enforced.

**Scope:** orchestrator + agents (observer, allocator, rater, timeline, digest); deterministic-first SQL flags feeding ai_insights without LLM; embeddings job (selective, chunked, incremental, 512-dim); ai_actions propose→confirm loop; project_timeline_events population + the delay-attribution timeline; daily digests tied to time_logs; the tiered model config (per-tier model selection, swappable).

**Exit criteria:**
- [ ] Deterministic flags (payment overdue N days, over-budget, stalled, missing tests) generate insights with zero LLM cost.
- [ ] Observer agent flags sentiment/scope-drift on pre-filtered conversations only; incremental (new messages only).
- [ ] Allocator proposes tasks (multi-assignee) → human confirm → task materializes + n8n notification fires.
- [ ] Rater produces impartial AI ratings with recorded basis; human directional ratings coexist.
- [ ] Timeline agent attributes delay (us/client/external); timeline renders.
- [ ] Digests generate per-user + per-PM/management nightly.
- [ ] Model tier is config-swappable (prove by switching the triage model).
- [ ] Token discipline verified (only flagged items reach the LLM).
- [ ] PROGRESS.md updated.

## Phase 4 — Client portal

**Goal:** clients log in (Neon Auth magic-link/OTP), see only their own data (client-safe projection) + the delay-attribution timeline, read-only.

**Exit criteria:**
- [ ] Client login by email → client-safe projection of their data ONLY (proven they cannot reach internal data/other clients).
- [ ] Deals/projects/progress/deliverables (client_delivery attachments) + the timeline visible, internal stuff stripped.
- [ ] Removing portal access (or archiving) revokes login.
- [ ] PROGRESS.md updated.

## Phase 5 — Ingress/egress, hardening, ETL

**Goal:** production-ready.

**Scope:** authenticated inbound endpoints (conversations from WhatsApp/Slack/Gmail/Upwork via n8n/Make, dedupe on external_message_id; deal/contract ingest); outbound n8n webhooks (task-create notifications, escalations, payment-chase reminders); ETL of the ~500 existing Airtable projects from CSV; caching layer (app + edge, spine-keyed invalidation); spend-cap verification on Neon; final security review (the three projections, credential reveal logging, audit completeness).

**Exit criteria:**
- [ ] Inbound ingest writes conversations/deals correctly, authenticated, deduped.
- [ ] Outbound notifications fire on the right events.
- [ ] Airtable projects imported via ETL.
- [ ] Caching live; renders fast for all roles; invalidation correct.
- [ ] Neon spend cap set; cost within expectation.
- [ ] Full security pass green.
- [ ] PROGRESS.md updated; system in production.

---

## Standing rules for every phase
- Read CLAUDE.md and the relevant SKILL before working.
- Delegate to subagents; keep contexts narrow.
- One phase at a time; meet exit criteria; update PROGRESS.md.
- UI-verification on all frontend work.
- Never violate the 15 non-negotiable rules in CLAUDE.md.
