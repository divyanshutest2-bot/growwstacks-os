# CLAUDE.md — GrowwStacks OS

**This file is loaded into every Claude Code session. Read it fully before doing anything. It is the operating contract for building this system.**

The authoritative design is `docs/ARCHITECTURE.md`. This file is the *rules of engagement*; ARCHITECTURE.md is *what to build*. When they conflict, ARCHITECTURE.md wins on schema/behavior and you flag the conflict.

---

## What this project is

GrowwStacks OS — an **AI-first internal operating system** for a 30-40 person AI/automation agency, replacing Airtable + HubSpot + GHL. Core entities: contacts (the hub), companies, deals, projects, milestones, tasks, payments, users — plus a multi-agent AI supervisor that observes, flags, allocates, rates, and reports.

**Stack (locked):** Neon Postgres · Cloudflare Pages (edge runtime) · Auth.js (next-auth v5, Resend magic-link, invite-only — Neon Auth deliberately OFF; see PROGRESS.md "AUTH DECISION") · Neon serverless driver · Next.js (server-actions-first) · Google Drive for files (via n8n) · Cloudflare Workers+Cron for AI jobs · n8n for in/out automation · OpenRouter (Kimi-tier + stronger model) for the running AI.

---

## THE NON-NEGOTIABLE RULES (violating these is the failure mode we are escaping)

1. **The database is the security boundary — never the UI.** Every table has RLS enabled. Every access path goes through a policy. Never enforce permissions only in React/server-action code. (The previous build leaked data because security lived in the UI.)

2. **Money & progress are COMPUTED, never stored as editable fields.** Payments and tasks are the only written facts. Received, outstanding, %, lifetime value, billing rollups, completion % = views/functions. If you ever find yourself writing an `UPDATE ... SET outstanding = ...`, STOP — you are creating drift.

3. **Completion % is by TASK COUNT only.** Milestone % = done_tasks/total_tasks. Project % = task-count-weighted across milestones. Hours NEVER feed completion (hours are a separate margin indicator).

4. **No deletion, ever. Archive only.** No hard-delete in code, no `DELETE` statements in app logic, no delete buttons. Every table has `archived_at`; "delete" sets it; every base view filters `archived_at IS NULL`.

5. **Ownership is ALWAYS a join table.** Contacts/deals/projects/milestones/tasks have multiple owners via join tables (`contact_owners`, `deal_owners`, `project_members`, `milestone_members`, `task_managers`, `task_assignees`). Never a single owner FK as source of truth. A cached primary-owner pointer for headers is allowed but is not authoritative.

6. **Universal modules are POLYMORPHIC.** attachments/notes/conversation_entries/ai_insights/ratings = one table each with `(parent_type, parent_id)`. Never `contact_attachments`, `deal_attachments`, etc. Always index `(parent_type, parent_id)`. Always validate the parent via trigger.

7. **Contact is the hub (reachable-from), not the parent of everything.** Each record has ONE real parent; contact is reached through it. Cached spine pointers (`contact_id`/`company_id`/`project_id`/`milestone_id`) are TRIGGER-MAINTAINED, never hand-set. Company is OPTIONAL on a contact (leads/solo clients have none; attach later → backfill trigger propagates).

8. **Field-level auto-save.** Every editable field saves on change; no giant edit-then-save forms. Every field must be safe to UPDATE in isolation and independently authorized by RLS.

9. **Edge-runtime-compatible from line one.** No Node-only APIs in server code. DB access only via the Neon serverless driver. This must run on Cloudflare Pages — never assume a Node server.

10. **Three view projections.** Full (admin/PM/sales), developer-safe (NO finance/deals/contacts/companies — money & client identity stripped), client-safe (own data only, internal stuff stripped). Implemented as RLS (rows) + role-specific views/column-grants (fields).

11. **AI proposes, humans dispose** for anything touching a person or client. Agent writes a proposal to `ai_actions` (status='proposed'); a human confirms before a task/rating/message materializes. Only low-risk insights `auto_apply`.

12. **Deterministic-first for AI.** Anything computable in SQL is SQL (payment overdue N days, over-budget hours, stalled milestone, missing tests) — free, instant, no LLM. The LLM is invoked only for language understanding, and only on SQL-pre-filtered items.

13. **Workload B is model-agnostic & tiered.** Agents call "the configured model for this tier" (never a hardcoded model). Cheap model (Kimi via OpenRouter) for high-volume triage; stronger model only for flagged judgment.

14. **SECURITY — secrets never in chat, never in the bundle.** Credentials are encrypted at rest (pgcrypto). The plaintext is read ONLY by the `reveal_credential` server action (service role) AFTER logging to `credential_access_log`. Never log a connection string or secret to the console. Never paste DB credentials or API keys into any file that gets committed. Privileged DB commands (running migrations) are executed by the human in their own terminal — you produce the migration files; you do not need and must not request the connection string.

15. **Audit everything that writes.** All creates/updates/archives (including AI-generated) write to `audit_log` via the `fn_audit` trigger. Capture all writes + sensitive reads (credential reveals, financial reads). NEVER log ordinary reads.

---

## How you work (the agent operating model)

- **You are the orchestrator. Deploy subagents IN PARALLEL wherever work is independent.** Delegate to the subagents in `.claude/agents/` (schema, rls, backend, frontend, ai-agent, qa); each has a narrow scope and its own context. **Run independent streams concurrently** (once the schema lands, backend-agent and frontend-agent work in parallel; rls-agent and qa-agent test in parallel with the build). Serialize only on true dependencies (RLS needs tables first; frontend wiring needs the design tokens). Do not do sequentially what can run concurrently — speed matters; this is a few-hours job with parallel agents, not a multi-day one.
- **Self-verify with Playwright + smoke tests; do not ask the human to check routine things.** After each unit, run the build, smoke tests, and Playwright browser checks (frontend). The human is for design judgment and supplying credentials, not for render/click verification.
- **Always read the relevant SKILL in `.claude/skills/` before doing that class of work.** Skills encode the exact patterns for this project (migration authoring, RLS policies, polymorphic tables, component contracts, agent authoring). Reading the skill first is mandatory — it prevents reinventing patterns inconsistently.
- **State lives in `.md` files, and you keep them current:**
  - `docs/ARCHITECTURE.md` — the source of truth (read-only for you unless explicitly told to amend; if you must amend, note it in PROGRESS.md).
  - `PLAN.md` — the phased plan. Read it to know the current phase and what's in scope.
  - `PROGRESS.md` — the **running log**: what's done, what's in flight, what's next, known issues, and any decisions/deviations. **Update it at the end of every meaningful unit of work, and stage that update IN THE SAME close-out commit as the work** — never defer it to a separate/later commit. 🚨 This rule lapsed during cross-cutting steps 0→2 (code shipped but PROGRESS.md wasn't updated per-commit; reconciled retroactively) and must not recur — a step is not "done" until its PROGRESS.md entry is in the commit. Keep the three docs in their lanes: **HANDOVER.md** = one-time orientation · **PLAN.md** = forward plan · **PROGRESS.md** = running log.
- **One phase at a time.** Don't jump ahead. Finish and verify the current phase's exit criteria (in PLAN.md) before advancing.
- **Verify before claiming done.** Run the build, run tests, and — critically — run the **UI-verification step** (see below) for any frontend work. "It compiles" is not "it works."

## The UI-verification rule — Playwright self-checks (this fixes the "UI doesn't align after deploy" pain)

**Claude Code runs its OWN browser checks via Playwright. The human is NOT the QA loop.** For ANY frontend change, before marking it done:
1. Build passes, no errors.
2. **Run a Playwright session against the dev server** — load the page in a headless browser, assert key elements render, take a screenshot, confirm the layout is intact (not just that it compiled). Click through the primary interactions (open a detail page, trigger an inline-edit auto-save, open a dropdown, submit a filter) and assert expected results.
3. Tokens-only — grep for hardcoded hex/px outside the token file; flag any.
4. Responsive: Playwright checks the primary breakpoints (mobile/tablet/desktop viewports), screenshots each.
5. Capture Playwright screenshots + assertions in the VERIFICATION LOG (PROGRESS.md); note any visual issue there rather than silently shipping.
The `qa-agent` owns Playwright enforcement. **Set Playwright up early (Phase 0/1) so every later phase self-verifies without human involvement.** Loop the human in only for genuine design judgment, never routine render/click checks.

## Definition of done (every task)

- [ ] Matches ARCHITECTURE.md (schema/behavior) and the relevant SKILL (pattern).
- [ ] RLS in place if it touches data (no UI-only gating).
- [ ] No stored derived values; no DELETE; no single-owner FKs as truth.
- [ ] Edge-runtime safe (no Node-only APIs; Neon serverless driver).
- [ ] Build + tests pass; UI-verification done if frontend.
- [ ] `PROGRESS.md` updated **and staged in the same close-out commit** (never a separate/later commit).

## When unsure

If a requirement is ambiguous or seems to conflict with ARCHITECTURE.md, **do not guess and do not silently pick** — note the ambiguity in PROGRESS.md and either ask or choose the option most consistent with the rules above, documenting the choice. Consistency with the architecture beats cleverness.

## Things you must NEVER do

- Never store a computed value (money/progress) as an editable column.
- Never write a DELETE in application logic or add a delete button.
- Never enforce access only in the UI.
- Never create per-parent tables for the polymorphic modules.
- Never use a single owner column as the source of truth.
- Never hardcode an AI model in the agent layer.
- Never use a Node-only API in code that runs on the edge.
- Never log or commit a secret/connection string; never request the DB credentials.
- Never hardcode colors/spacing in components — tokens only.
- Never mark frontend work done without the UI-verification step.
