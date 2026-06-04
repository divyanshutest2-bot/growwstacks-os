# GrowwStacks OS — System Architecture

**Status:** Foundation v2 (clean rebuild). This is the single source of truth for the system. Nothing is built against the database until it agrees with this document. When reality and this document disagree, one of them gets fixed on purpose — never silently.

**This document supersedes everything before it.** It is written as an *independent, from-scratch project*. See the Golden Rules below.

**Audience:** Manish (decisions — most are now locked), Raghav (implementation via Claude Code), and any future contributor.

---

## Golden Rules (read first, they override everything)

1. **The reference screens are discarded.** Earlier UI screenshots were the end of many iterations on an unthoughtful base. They are *not* a reference for this build. We rebuild every screen fresh, bottom-up, with new UX/IA thinking. No color, layout, component, or interaction is inherited from them. They informed *what data exists* (a sanity check on requirements) and nothing about *how it looks or is built*.

2. **No deletion, ever, by anyone — including admin.** Records are **archived**, never deleted. Everything is status/filter-based. (If legal erasure is ever genuinely required, that is a separate, deliberate, logged, admin-only operation — not a normal capability, not in the UI.)

3. **AI is the core, not a feature.** This is an AI-first system: a multi-agent supervisor that observes, flags, assigns, rates, and reports — with humans confirming anything that touches a person or a client. The data layer is built so the AI layer sits on it cleanly (§8, §9).

4. **Money/progress/state are computed, never stored as editable fields.** Payments and tasks are the only facts written; everything financial and every completion % is derived. This is the anti-drift core (§7) and the reason the previous build needed endless patching.

5. **The database is the security boundary, not the UI.** All access is enforced by Postgres Row-Level Security and role-scoped views (§6). The UI is never trusted to enforce permissions.

6. **One auth for everyone, passwordless.** Client, developer, PM, admin — all log in by magic-link / OTP to their company (or, for clients, their known) email. No passwords, no second auth system. Killing someone's email kills their access.

---

## The Stack (locked)

| Layer | Choice | Why |
|---|---|---|
| **Database** | **Neon Postgres** (Launch plan, usage-based ~$15/mo, **spend limit set**) | Pure Postgres -> RLS, triggers, views, pgvector all run unchanged. Scale-to-zero suits idle-heavy usage. **Configurable spend cap = no surprise bills** (the hard requirement). Backups are pennies (text-only DB). |
| **Hosting (frontend + server)** | **Cloudflare Pages** (`@cloudflare/next-on-pages`) | Near-zero cost, edge-fast. Architecture is written **edge-runtime-compatible from line one** so this is a non-issue, not a workaround. |
| **Auth** | **Neon Auth** (Stack Auth-based) — magic-link / OTP, all roles | Integrated with Neon: authenticated users **sync directly into Postgres**, so the `users.id = auth identity` bridge that all RLS depends on is automatic. Unified passwordless login, email-bound (removal kills access). *Fallback if any edge-runtime issue on Cloudflare: Auth.js — architecture is identical either way.* |
| **DB driver** | **Neon serverless driver** (HTTP/WebSocket) | Built for edge runtimes; works on Cloudflare Pages where node-postgres won't. |
| **File storage** | **Google Drive** via existing n8n webhook | Keeps the DB tiny (-> Neon stays cheap). Already built. Store URL + `drive_file_id` only. |
| **Background / scheduled jobs** | **Cloudflare Workers + Cron Triggers** | The nightly AI jobs (digests, insights, embeddings, timeline analysis). Already operated for WorkWitness. |
| **Automation bridge (in/out)** | **n8n** (self-hosted, existing VPS) | Inward: ingest conversations, deal/contract data, Upwork. Outward: notify devs/PMs on WhatsApp/Teams/Slack when AI creates a task. n8n stays in its lane — automation, not auth. |
| **LLM** | **OpenRouter** (existing) | Model routing for the agent layer; cheap models for triage, strong models for judgment. |
| **App framework** | **Next.js** (server-actions-first) | Already your pattern. Direct-to-Postgres via server actions; RLS does the gating. |

**Cost expectation (30-40 person team, 40-50 projects/mo):** Neon ~$15 (capped), Cloudflare ~$0, Auth.js $0, Drive $0, LLM ~$30-80 (disciplined). **All-in ~ $45-95/month, hard-capped on the one variable that could surprise (DB), with AI tokens the only thing to actively manage.** No surprise-bill exposure.

---

## 0. How to read this document

Every table section: **Purpose, Columns, Relationships, Derived (never stored), Access intent**. Constraints worth enforcing in SQL are called out; full `CREATE TABLE` SQL lives in the migration files (so this doc stays *intent*, migrations stay *implementation* — drift between them is then a real signal).

Conventions:
- **`snake_case`** everywhere. No quoted CamelCase columns.
- **Surrogate `uuid` PK on every table**, plus a separate human display number where wanted (CT-101, CO-201, DL-####, pr-####, M#, T-#, PMT-####). The display number is for humans and is **never a foreign key**.
- **No `deleted_at`. Instead `archived_at timestamptz`.** Every base view filters `archived_at IS NULL`. Nothing is ever hard-deleted by the application.
- **Edge-runtime safe:** no server code assumes Node-only APIs; DB access via the Neon serverless driver.

---

## 1. The core architectural decisions

### Decision 1 — Contact is the hub, but not the *parent* of everything
"Contact is the central hub" = everything is **reachable from** a contact. It does **not** mean everything is **parented by** a contact. Each record has one *primary owning entity* (its real parent); the contact is reached *through* it. We keep a **denormalized cached `contact_id`** on such tables for fast filtering, **maintained by trigger** (§11), never hand-set.

### Decision 2 — Universal modules are polymorphic, not per-table
Attachments, notes, conversation entries, AI insights, ratings each = one polymorphic table (`parent_type` enum + `parent_id` uuid). Integrity via the enum + a `fn_validate_parent` trigger + a nightly orphan sweep (near-irrelevant since nothing is hard-deleted). Composite index `(parent_type, parent_id)` mandatory. Adding a module to a new entity is then free.

### Decision 3 — Money & progress are computed, never stored as editable fields
Payments and tasks are the only written facts. Received, outstanding, % collected, lifetime value, billing rollups, completion % — all derived via views/functions. Storing them is what made the old build drift.

### Decision 3a — Completion is by TASK COUNT, not hours
**Milestone % = done_tasks / total_tasks.** Hours are an effort indicator (margin/over-budget flags), never a completion measure. **Project % = task-count-weighted roll-up of its milestones.** Hours spent displayed separately, never feeds completion. Functions: `fn_milestone_pct`, `fn_project_pct`.

### Decision 4 — Auto-save = field-level, individually-authorized writes
Every field saves on change. Every editable field is safe to update in isolation; every such update is independently authorized by RLS. A `PATCH` of one column is always valid.

### Decision 5 — Single-org, role-scoped RLS + THREE view projections
One org, so no per-row tenant_id. A `users` table mirroring auth identities, a `role` enum, policies in terms of role + relationship. Three projections of the core entities, because three audiences see the same data differently:
- **Full** (admin / PM / sales) — everything.
- **Developer-safe** — delivery work + polymorphic modules + own ratings + own time, but a **hard wall on all finance, deals, contacts, companies**.
- **Client-safe** — a client sees only their own deals/projects/progress/deliverables, internal notes/insights/ratings/margins stripped.
RLS (rows) + role-specific views and column grants (fields). Detailed in §6.

### Decision 6 — AI-first, multi-agent, human-in-the-loop
AI is a **multi-agent supervisor** (not a monolith): observer, allocator, rater, timeline, digest agents under an **orchestrator**, each with its own state. Deterministic facts stay cheap SQL; AI is invoked only for language understanding. Anything touching a person/client is **proposed by AI, confirmed by a human**, recorded in `ai_actions`. Full treatment in §8.

### Decision 7 — Edge-runtime-native, host-portable
Written for Cloudflare's edge runtime (Neon serverless driver, no Node-only APIs). Plain Postgres = host-portable; never locked to one provider again.

### Decision 8 — Ownership is ALWAYS a join table, never a column
Contacts, deals, projects, milestones, and tasks can each have **multiple owners** (two deal owners, two PMs on a project, two+ developers on a task, multiple contact owners). The moment an entity can have two owners, a single FK column is wrong. So **every ownership relationship is a join table** (`contact_owners`, `deal_owners`, `project_members`, `milestone_members`, `task_managers`, `task_assignees`), and that join is **authoritative**. A denormalized single "primary/lead owner" pointer MAY remain as a cached convenience for fast list-header rendering (one avatar), but it is a cache (trigger-maintained), never the source of truth. RLS ownership checks become "is the user *one of* the owners" (a join lookup), not "owner_id = me". The AI allocator can propose multiple assignees per task; directional rating applies per-person across them.

### Decision 9 — Workload B (the running AI) is multi-model & model-agnostic
The in-production AI supervisor (§8) is built **model-agnostic**: every agent calls "the configured model for this tier," never a hardcoded model. Two tiers, both via **OpenRouter**: a **cheap high-volume model** (e.g. Kimi/K2) for triage passes over conversations/entities, and a **stronger model** only for the small flagged subset needing nuanced judgment. Swapping or A/B-ing models is a config change, not a code change. (Workload A — *building* the system — uses Claude Code with Claude models; cost there is controlled by context discipline + subagents, not by a weaker model.)

---

## 2. Entity map

```
                         ┌──────────────┐
                         │  COMPANIES   │  CO-201   (OPTIONAL for a contact)
                         └──────┬───────┘
                                │ 1 company -> many contacts (attach anytime; never required)
                                ▼
        ┌───────────────────────────────────────────────┐
        │                  CONTACTS                       │  CT-101   ◄── the hub
        │   the entity everything is *reachable from*     │
        │   (a contact needs NO company; standalone OK)   │
        └───┬───────────┬───────────┬──────────┬─────────┘
            ▼           ▼           ▼          ▼
        ┌───────┐   ┌────────┐  ┌─────────┐  (conversation, notes, attachments,
        │ DEALS │   │PROJECTS│  │CREDS map│   ai_insights, ratings — polymorphic)
        │DL-4996│   │ pr-3012│  └─────────┘
        └───┬───┘   └───┬────┘
            │           │ 1 project -> many milestones
            │           ▼
            │       ┌────────────┐
            │       │ MILESTONES │  M1 (scoped per project)
            │       └─────┬──────┘
            │             │ 1 milestone -> many tasks
            │             ▼
            │         ┌───────┐
            │         │ TASKS │  T-13 (global numbering)
            │         └───┬───┘
            │             ▼
            │      ┌──────────────┐   ┌──────────────┐
            │      │ TESTS        │   │ TIME_LOGS    │
            │      │ dev + UAT    │   │ user->task   │
            │      └──────────────┘   └──────────────┘
            │
            └────────────► PAYMENTS (PMT-2020)
                           primary parent = deal (required)
                           optional links = project, milestone
                           contact = derived/cached

   USERS (internal team)  ── assigned to ──► projects, milestones, tasks
                          ── AI/human rate ─► tasks/people (directional)

   AI LAYER (§8):  ai_insights · ai_actions · sop_documents · digests
                   project_timeline_events · embeddings (pgvector)
                   coordinated by a multi-agent orchestrator

   POLYMORPHIC (attach to ANY core entity):
     attachments · notes · conversation_entries · ai_insights · ratings

   PLATFORM:  audit_log · credential_access_log · apps/app_links
              lead_sources/tags joins · enums/lookups

   INGRESS/EGRESS:  inbound endpoints (conversations, deals, Upwork)
                    outbound webhooks via n8n (notify on task create, etc.)
```

Spine: **Company(optional) -> Contact -> (Deal | Project -> Milestone -> Task)**, money rolling up from payments, five polymorphic modules clipping onto anything, an AI layer reading all of it.

---

## 3. The polymorphic pattern (implement once)

Two columns instead of a normal FK:
```
parent_type  entity_type  not null,  -- enum
parent_id    uuid         not null,
```
`entity_type` enum members: `contact, company, deal, project, milestone, task, payment, user, test, note, rating`.

Integrity: the enum (no typos) + `fn_validate_parent` BEFORE INSERT/UPDATE (parent must resolve) + nightly orphan sweep (backstop). Mandatory composite index `(parent_type, parent_id)`. Querying "everything attached to X" is one indexed lookup; deep contact-centric queries get helper views (§7.6).

---

## 4. Table catalog — core entities

### 4.1 `companies` (CO-201) — OPTIONAL accounts

**Purpose:** the organization a contact belongs to. **A company is never required for a contact** — leads and solo clients have none. One company has many contacts; a company is created on its own schedule and **attached to a contact whenever known** (a single field update; see the backfill trigger in §11).

**Columns:** `id` uuid PK · `display_id` text unique (`CO-###`, from 201) · `name` not null · `website` · `industry` (text; promote to lookup only if filtering needs it) · `company_size` enum (`1-10|11-50|50-200|200+`) · `city` · `state` · `country` · `type` enum `company_type` (`prospect|client|partner|past_client`) · `account_owner_id` uuid FK->users · `about` text (Markdown) · `created_at` · `updated_at` · `archived_at`.

**Relationships:** has many contacts (`contacts.company_id`). Projects/deals/etc. are reached *through* contacts.
**Derived:** contacts count, projects (total/active), open deals, **lifetime value** = sum of received-status payments across the company's contacts' deals (`v_company_rollup`).
**Access:** admin/PM/sales/finance read all; sales write own; **developers: no access to companies at all** (the hard wall — Decision 5).

### 4.2 `contacts` (CT-101) — the hub

**Purpose:** every person you deal with — lead or client. The most-linked table; everything is reachable from here. **Company is optional.**

**Columns:** `id` · `display_id` (`CT-###`, from 101) · `full_name` not null · `email` · `phone` · `whatsapp` · `slack_id` · `teams_channel` (name) · `teams_channel_id` (raw, e.g. `19:...@thread.tacv2`) · `country` · `city` · `state` · `main_platform` enum `platform` (`whatsapp|teams|slack|email|upwork|other`) · `status` enum `contact_status` (`prospect|active_client|partner|on_hold|churned`) · `rating` enum `contact_rating` (`great|good|average|bad` — distinct from 1-5 star ratings) · ~~`contact_owner_id`~~ **multi-owner -> `contact_owners(contact_id, user_id)`** (optional cached `primary_owner_id` for header) · `company_id` uuid FK->companies **NULLABLE** · `about` text (Markdown) · `is_client_portal_enabled` boolean default false (gates client login — §6.5) · `created_at` · `updated_at` · `archived_at`.

**Lead source is multi-value** -> `contact_lead_sources(contact_id, lead_source)` against enum `lead_source` (`upwork_bid|upwork_direct|website_form|call|inquiry|referral|make_opportunity|open_source_linkedin`).

**Relationships:** belongs to one company (optional); has many deals, projects, lead-sources; polymorphic parent for conversation/attachments/notes/ai_insights/ratings and the credential_links join.
**Derived:** lifetime value (received payments across this contact's deals), open deals, projects total/active, open tasks, active milestones, last activity (max over conversation + task updates) — `v_contact_rollup`.
**Access:** admin/PM/sales/finance read all; sales write own; **developers: no access to contacts at all** (hard wall).

### 4.3 `deals` (DL-####) — sales pipeline

**Purpose:** a sales opportunity against a contact, moving through stages, carrying value + payment type. A won deal spawns delivery work (projects).

**Columns:** `id` · `display_id` (`DL-####`) · `name` not null · `contact_id` uuid FK->contacts **not null** · `company_id` uuid FK->companies nullable, **cached from contact** · `stage` enum `deal_stage` (`new|qualified|requirement_analysis|proposal|price_quote|negotiation|review|payment_followup|approval|closed_won|closed_lost|on_hold|handed_over|lost_after_handover|lost_no_response|lost_not_fit`) · ~~`owner_id`~~ **multi-owner -> `deal_owners(deal_id, user_id)`** (optional cached `primary_owner_id` for header) · `payment_type` enum `payment_type` (`milestone|one_time|early|retainer|subscription`) · `deal_value` numeric(14,2) · `currency` char(3) ISO-4217 · `close_date` date · `description` text (Markdown) · `created_at` · `updated_at` · `archived_at`. (No "deal source" — source lives on the contact.)
**Tags multi-value** -> `deal_tags(deal_id, tag)`.

**Relationships:** belongs to one contact (required) + cached company; has many payments; spawns projects (`projects.deal_id`); polymorphic parent for conversation/attachments/notes/ai_insights/ratings/tasks.
**Derived:** received, outstanding, % collected, star rating (from `ratings`) — `v_deal_billing`, `v_deal_rollup`.
**Access:** admin/PM read+write all; sales read+write own; finance read all; **developers: NO access**. **Sales cannot create projects** (only flag `closed_won`; admin/PM create projects).

### 4.4 `projects` (pr-####) — delivery work

**Purpose:** the execution container for a won deal. Holds milestones -> tasks. Where the team works day-to-day.

**Columns:** `id` · `display_id` (`pr-####`, lowercase) · `name` not null · `deal_id` uuid FK->deals nullable (internal projects have none) · `contact_id` uuid FK **cached** from deal (spine pointer; nullable for internal) · `company_id` uuid cached · `status` enum `project_status` (`upcoming|in_progress|client_pending|on_hold|payment_pending|handover|completed|internal|lost`) · `start_date` · `estimated_completion_date` · `actual_completion_date` · `estimated_hours` numeric(8,1) · `team_logger_project_name` · `team_logger_project_id` · `project_manager_id` uuid FK->users (OPTIONAL cached *lead* PM for header only; **`project_members` role='pm' is authoritative** — supports multiple PMs) · `requirement` text (Markdown) · `overview` text (Markdown) · `created_at` · `updated_at` · `archived_at`.
- `schedule_state` is **derived** (`fn_schedule_state`), not stored.
- **Team** -> `project_members(project_id, user_id, role)` role in (`pm`,`developer`).
- **Apps** -> `app_links(parent_type='project')`. **Credentials** -> `credential_links(parent_type='project')`, filtered to the project's contact.
- **Hours spent** -> derived (sum of `time_logs` for tasks in this project's milestones).

**Derived:** completion % (task-count milestone roll-up), hours spent, billing (agreed = deal_value; received/outstanding/% from payments), schedule_state, blockers count, milestone counts.
**Access:** admin/PM read+write all; developers read+write projects they're a member of — **via the developer-safe view (`v_project_dev`) with all money + client fields stripped**; sales read (own contacts), no create; finance read all + write billing-adjacent only. Clients see their own projects via `v_project_client` (§6.5).

### 4.5 `milestones` (M#, scoped per project)

**Purpose:** a billable, schedulable chunk of a project. Progress (task-count) and money roll up from here.

**Columns:** `id` · `display_id` (`M#`, **unique per project** via a `next_milestone_seq` counter on the project) · `name` not null · `project_id` uuid FK->projects not null · `contact_id`,`company_id` cached · `status` enum `milestone_status` (`not_started|in_progress|in_review|on_hold|done`) · `milestone_manager_id` uuid FK->users (defaults from project PM, overridable) · `start_date` · `target_date` · `actual_completion_date` · `estimated_hours` numeric(8,1) · `price` numeric(14,2) · `currency` char(3) · `created_at` · `updated_at` · `archived_at`.
- `schedule_state` derived.
- **Team (multi-PM + multi-dev)** -> `milestone_members(milestone_id, user_id, role)`. **Credentials** -> `credential_links(parent_type='milestone')`.

**Derived:** completion % = done_tasks/total_tasks, hours spent, billing (agreed=price; received from payments linked to this milestone; outstanding; %), dev-test + UAT pass counts, task counts.
**Access:** inherits project membership logic; developer-safe and client-safe projections apply.

### 4.6 `tasks` (T-#, GLOBAL numbering)

**Purpose:** the atomic unit of execution. Everything above gives it context; everything attached measures it.

**Columns:** `id` · `display_id` (`T-#`, **global** sequence, unique system-wide) · `title` not null · `parent_type` enum (`milestone|deal|payment`) + `parent_id` uuid (most tasks parent a milestone; deal/payment parents enable follow-up tasks like "send receipt") · `project_id`,`milestone_id`,`contact_id`,`company_id` **cached** (when parent is a milestone) · `status` enum `task_status` (`upcoming|waiting_for_client|waiting_to_start|todo|in_progress|visibility_check|qa_review|client_review|client_pending|internal_action|stuck|on_hold|done|lost`) · `delivery_state` enum (`not_delivered|delivered`) — separate from status · `priority` enum (`low|medium|high`) · **multi-PM -> `task_managers(task_id, user_id)`** (optional cached `primary_pm_id` for header; defaults from milestone) · `start_date` · `plan_due_date` · `execution_start_date` · `execution_end_date` · `time_reported_hours` numeric(8,1) (planned/quoted on the task; **time spent is derived** from time_logs) · `requirement` text (Markdown) · `details` text (Markdown) · `created_at` · `updated_at` · `archived_at`.
- **Developers** -> `task_assignees(task_id, user_id)` (multiple). **PMs** -> `task_managers(task_id, user_id)` (multiple). **Apps** -> `app_links(parent_type='task')`.
- `ai_created` boolean default false + link to the `ai_actions` row when an agent created it (§8).

**Derived:** time spent, schedule/overdue, dev/UAT test counts, internal rating (avg of `ratings`).
**Access:** admin/PM read+write tasks in their projects; developer read+write tasks they're assigned to / in their projects (via developer-safe view); field-level auto-save is the norm (kanban status changes).


---

## 5. Table catalog — polymorphic modules + supporting tables

### 5.1 `attachments` — files & links, everywhere
`id` · `parent_type`,`parent_id` · `kind` enum (`file|link`) · `title` not null · `url` not null (Drive URL or external) · `mime_type` · `size_bytes` · `drive_file_id` (re-resolve Drive permissions later) · `purpose` text (`requirement|client_delivery|signed_contract|proof_of_payment|...` — lets one table serve every attachment card without new tables) · `uploaded_by` uuid FK->users · `created_at` · `archived_at`. Index `(parent_type,parent_id)` + `(parent_type,parent_id,purpose)`. Files go to **Google Drive via n8n** (multipart, field `file`); store URL only. Drive secrets stay in n8n, never in app/chat. **Access:** read/write iff you can read/write the parent (delegated check).

### 5.2 `notes` — Markdown notes, everywhere
`id` · `parent_type`,`parent_id` · `title` (nullable) · `body` (Markdown) · `author_id` · `created_at` · `updated_at` · `archived_at`. A note can itself be a polymorphic parent (`attachments.parent_type='note'`). Index `(parent_type,parent_id)`. Access delegated to parent. **Client-safe projection hides internal notes from clients.**

### 5.3 `conversation_entries` — multi-channel messages
`id` · `parent_type`,`parent_id` (usually contact/deal) · `channel` enum `conversation_channel` (`phone|slack|gmail|outlook|whatsapp|upwork|google_meet|zoom|fireflies|teams`) · `direction` enum (`inbound|outbound`) · `sender_user_id` uuid FK->users null · `sender_contact_id` uuid FK->contacts null (**CHECK: exactly one set**) · `body` · `external_message_id` (dedupe on sync) · `external_thread_id` · `occurred_at` timestamptz not null · `meeting_recording_url` · `meeting_summary` · `duration_minutes` · `created_at`. Order ascending by `occurred_at`. Index `(parent_type,parent_id,occurred_at)`. **Ingress:** entries arrive via inbound endpoints fed by n8n/Make/Unipile from multiple platforms (§10). **Sending** via `send_message` edge action (§10). **This table is a primary embedding source — see §8 vectorization.** Access delegated to parent.

### 5.4 `ai_insights` — blockers + highlights, everywhere
`id` · `parent_type`,`parent_id` · `kind` enum (`blocker|highlight`) · `sentiment` enum (`positive|neutral|risk`) · `body` · `generated_at` · `generated_by` enum (`ai|human`) · `is_active` boolean default true (resolved -> inactive, kept for history) · `source_evidence` jsonb (which messages/facts the AI used — for trust/debug) · `created_at` · `archived_at`. Index `(parent_type,parent_id,kind,is_active)`. Produced by the agent layer (§8), read by the app. Access: read delegated to parent (and stripped from client-safe views); write = service role + admin.

### 5.5 `ratings` — directional star + feedback (human OR AI)
`id` · `parent_type` (usually `task`; also deal/project/milestone/contact) · `parent_id` · `rater_type` enum (`human|ai`) · `rater_user_id` uuid FK->users null (null when rater_type=ai) · `ratee_user_id` uuid FK->users null (null when rating a *thing* not a person) · `stars` smallint CHECK 1..5 · `feedback` text · `rating_basis` jsonb null (for AI ratings: the parameters/SOP criteria scored — makes AI rating auditable and unbiased by design) · `created_at` · `updated_at` · `archived_at`.
- **Directional rule** enforced by `fn_check_rating_direction` for **human** ratings: admin->pm, pm->developer. **AI ratings bypass direction** (the AI is an impartial system rater — Decision 6) but must carry `rating_basis`.
- Attachments (appreciation) -> `attachments(parent_type='rating')`.
**Derived:** user avg rating, task internal rating.
**Access:** humans create per valid direction; AI ratings written by service role; you read ratings about yourself and (PM/admin) about reports; developers don't see peers' individual ratings.

### 5.6 `users` — internal team
`id` uuid PK **= auth identity id** · `display_id` · `full_name` not null · `email` not null unique · `phone` · `whatsapp` · `teams_id` · `team_logger_id` · `role` enum `user_role` (`admin|pm|developer|sales|finance|viewer`) **drives all RLS** · `job_title` text (cosmetic) · `status` enum `user_status` (`active|away|left_org`) (drives green/yellow/red dot; `left_org` also means no login since email is gone) · `shift_start` time · `shift_end` time · `projects_requested` int default 0 · `created_at` · `updated_at` · `archived_at`.
- **Availability** -> `user_availability(user_id, date, available_hours)` (one row per user per day; query the window for "today/tomorrow/next 7 days" — never store as fixed columns).
- **Tech expertise** -> `app_links(parent_type='user', proficiency)` enum (`expert|intermediate`).
**Derived:** active tasks, projects count, avg rating, tests done, **revenue (month)** (sum of payments on milestones/projects this user PM'd/delivered, in month), workload by status, current availability — `v_user_rollup`. Connects to **timesheet/digest** (§8): planned-vs-actual today + plan for today/tomorrow/week.
**Access:** everyone reads the directory; users update own profile; **role & status admin-writable only** (no self-promotion). **Time logs: PMs see aggregates not raw rows; developers see own only — see 5.10.**

### 5.7 `payments` (PMT-####) — the only money facts
`id` · `display_id` (`PMT-####`) · `deal_id` uuid FK->deals **not null** (required primary parent) · `project_id` uuid FK nullable · `milestone_id` uuid FK nullable · `contact_id` uuid FK **cached** from deal · `amount` numeric(14,2) not null · `currency` char(3) not null · `payment_type` enum (defaults from deal) · `payment_date` date · `transaction_ref` · `status` enum `payment_status` (`due|overdue|client_paid|received|confirmed|in_team_accounts`) · `created_by` uuid FK->users · `confirmed_by` uuid FK->users null · `note` · `created_at` · `updated_at` · `archived_at`.
- **Received-money predicate** `fn_is_received(status)` -> true for `received,confirmed,client_paid,in_team_accounts`; false for `due,overdue`. Defined once; every rollup calls it.
- Receipts -> `attachments(parent_type='payment',purpose='proof_of_payment')`. Follow-up tasks -> `tasks(parent_type='payment')`.
**Access:** finance + admin read+write all; **PM read+write all payments** (they coordinate payment); sales read own deals + may *record* a payment as `due`/`client_paid`; **only finance/admin may set `confirmed`/`in_team_accounts` + `confirmed_by`**; **developers: NO access to payments** (hard wall). Clients see only their own payment *status*, not internal breakdowns (§6.5).

### 5.8 `credentials` — the vault
`id` · `contact_id` uuid FK->contacts not null (credentials belong to a client; linked to projects/milestones) · `label` not null · `login_url` · `username` · `secret_ref` (Vault/pgcrypto reference or ciphertext — **see encryption note**) · `two_factor_enabled` bool · `two_factor_destination` · `we_have_account_access` bool · `our_access_account` · `client_credentials_available` bool · `notes` · `created_by` · `created_at` · `updated_at` · `archived_at`.
- **Linking** -> `credential_links(credential_id, parent_type, parent_id)` parent in (contact, project, milestone); filtered to the parent's contact when picking.
- **Access logging** -> `credential_access_log(id, credential_id, user_id, accessed_at, ip)` — every reveal logs a row (independent of permission; even admin reveals are logged).
- **ENCRYPTION (decided: encrypt at rest, v1):** secrets encrypted at rest via Postgres **`pgcrypto`** (Neon-compatible; Supabase Vault is not used since we're not on Supabase). Decryption happens **server-side only** in the `reveal_credential` action, only for authorized users, only after writing the access-log row. The app's normal role can never read plaintext (column-level denial). This lets us tell clients "credentials encrypted at rest." (Access control + logging is the high-value part; encryption is the cheap added assurance — both included.)
**Access (metadata):** admin/PM read all relevant; **developers may read metadata for credentials linked to their projects/milestones and may REVEAL via the logged flow** (the spec: developers mostly need these); sales/finance per need. No role reads the secret column directly — only the reveal action (service role) decrypts.

### 5.9 `tests` — developer + UAT
`id` · `parent_type` (`milestone|task`) + `parent_id` · `test_type` enum (`developer|uat`) · `title` · `brief` · `outcome` enum (`pass|fail`) · `tester_user_id` uuid FK->users · `tester_role` enum (`developer|pm`) · `feedback_title` · `feedback_body` (Markdown) · `conducted_at` timestamptz · `passed_at` timestamptz null · `created_at` · `updated_at` · `archived_at`. Evidence -> `attachments(parent_type='test')`. Index `(parent_type,parent_id,test_type)`. **Minimum 3 dev + 3 UAT** is a validation rule surfaced from a count. **Access:** delegated to parent; developers write dev tests on their tasks; PMs write UAT/dev; clients may see UAT pass/fail summary on their deliverables (client-safe), not internal dev-test detail.

### 5.10 `time_logs` — who spent how long on what
`id` · `task_id` uuid FK->tasks not null (time always lands on a task) · `user_id` uuid FK->users not null · `minutes` int not null (render hours; avoids float drift) · `logged_for_date` date · `source` enum (`manual|team_logger`) · `note` · `project_id`,`milestone_id` **cached** from task (for fast rollup) · `created_at` · `updated_at` · `archived_at`. Indexes `(task_id)`,`(user_id,logged_for_date)`,`(project_id)`,`(milestone_id)`.
**Access (the corrected rule):** developers **write + read their OWN logs only**; **PMs read AGGREGATE hours** (via rollup views: "project 116/180h") **but NOT raw per-user rows** (no "Imran logged 6h Tuesday"); admin/finance read all; sales none. The aggregate-vs-raw split is enforced by giving PMs access to the rollup views, not the `time_logs` table directly.

### 5.11 `apps` + `app_links` — app catalog
`apps`: `id` · `name` unique · `icon_key` · `category` · `created_at` · `archived_at`.
`app_links` (polymorphic): `id` · `app_id` FK->apps · `parent_type` (`project|milestone|task|user`) + `parent_id` · `proficiency` enum (`expert|intermediate`, only for `user`) · `created_at` · `archived_at` · unique `(app_id,parent_type,parent_id)`. No hard-coded app names anywhere.

### 5.12 Enums vs lookups
**Enums** (code branches on them; mistyping impossible; change = migration): all `*_status`, `*_stage`, `priority`, `payment_type`, `payment_status`, `conversation_channel`, `entity_type`, `attachment_kind`, `insight_kind`, `sentiment`, `test_type`, `test_outcome`, `user_role`, `user_status`, `proficiency`, `lead_source`, `platform`, `contact_rating`, `company_type`, `company_size`, `rater_type`.
**Lookup tables** (runtime-extensible, no deploy): `apps`, `tags` (if managed vocab), industries (free text to start).

---

## 6. Row-Level Security — the real boundary + three projections

The UI is **not** a security boundary. Every table has RLS on; every access path goes through a policy. The previous build's gaps (developers reading all companies/contacts via the API; sales creating projects via the API) are closed here at the policy layer.

### 6.1 Identity bridge
`users.id` = the Auth.js identity id. Helpers (`SECURITY DEFINER`): `fn_me()`, `fn_my_role()`, `fn_is_admin()`, `fn_is_member_of_project(p)`, `fn_can_see_contact(c)`, plus dispatchers `fn_can_see(parent_type,parent_id)` / `fn_can_edit(parent_type,parent_id)` for polymorphic tables. Define once; every policy calls them.

### 6.2 Capability matrix (locked)

| Entity | admin | pm | developer | sales | finance | client |
|---|---|---|---|---|---|---|
| companies | RW all | R all | **NONE** | R all, W own | R all | own only (name) |
| contacts | RW all | R all | **NONE** | R all, W own | R all | self only |
| deals | RW all | RW all | **NONE** | RW own, **no project create** | R all | own (read) |
| projects | RW all | RW all | **RW if member — money/client stripped** | R own contacts, no create | R all, W billing | own (read, client-safe) |
| milestones | RW all | RW all | **RW if member — money stripped** | R | R all | own (read, client-safe) |
| tasks | RW all | RW all | **RW if assignee/member** | R | R all | own progress (read) |
| payments | RW all | RW all | **NONE** | R own deals, create-unconfirmed | RW all, **only finance confirms** | own status only |
| credentials (meta) | RW all | R relevant | **R linked + REVEAL (logged)** | per need | per need | none |
| credentials (secret) | reveal-action + log only (no direct read by any role) | | | | | none |
| users | RW all, sets role/status | R all, W own | R all, W own | R all, W own | R all, W own | none |
| time_logs | R all | **aggregate only (rollup views)** | **own only** | none | R all | none |
| ratings | RW | create pm->dev, R reports | R own | none | none | none |
| ai_insights / notes (internal) | follows parent | follows parent | follows parent (own work) | follows parent | follows parent | **stripped** |
| attachments / conversation | follows parent | follows parent | follows parent (own work) | follows parent | follows parent | client_delivery + own only |

Hard rules embedded: **developers see no finance, no deals, no contacts, no companies, no payments** — only their delivery work and the polymorphic modules on it, plus own ratings/time and credential-reveal. **Sales cannot create projects.** **Only finance confirms payments.** **PMs get aggregate hours, not raw time rows.**

### 6.3 Polymorphic RLS
The five polymorphic tables don't re-implement per-parent rules; their policies call `fn_can_see/fn_can_edit(parent_type,parent_id)`, which routes to the right core-entity check. "Can I see this attachment?" reduces to "can I see its parent?" — written once.

### 6.4 The three view projections (rows + fields)
RLS controls *rows*; views + column grants control *fields*. We ship three projections of the core entities:
- **Full** views (`v_project`, `v_milestone`, `v_deal`, …) — admin/PM/sales. Everything incl. billing/client.
- **Developer-safe** (`v_project_dev`, `v_milestone_dev`, `v_task_dev`) — money columns and client identity **absent**; a developer sees "Project: Lead-routing automation" but never "Client: Northwind Labs (₹48.2L)" nor any billing/payment/deal data. Billing rollup views (`v_project_billing`, etc.) and `payments` simply have **no developer SELECT policy**.
- **Client-safe** (`v_project_client`, `v_milestone_client`, `v_task_client`, `v_deliverables_client`, `v_timeline_client`) — a client sees only their own contact's deals/projects/progress/deliverables and the **project timeline** (§8.5), with internal notes/insights/ratings/margins/hours stripped.

### 6.5 Auth + client portal (one passwordless auth for all)
- **Neon Auth** issues magic-link / OTP to email for **every** role — client, developer, PM, admin. No passwords. No second system.
- A login email is matched: internal emails -> a `users` row (role drives access); a known **client** email -> a `contacts` row with `is_client_portal_enabled=true` -> the client-safe projection of *their* data only.
- **Removing someone** = archive the user + their email dies -> magic-link can't be delivered -> access gone. Same for disabling a client's portal flag.
- The client portal surfaces: their deals, their projects, **task/deliverable progress**, what's been delivered (the `client_delivery` attachments), and the **project timeline** that shows where delay actually originated (§8.5) — all read-only, client-safe.

### 6.6 The credential-secret hole (the one deliberate exception)
The secret column has a column-privilege denial for all app roles. The only reader is the `reveal_credential` action running as service role, which logs to `credential_access_log` first, then decrypts (pgcrypto). Everything else is RLS.


---

## 7. Computed rollups — the anti-drift core

Everything here is read-time computation (views/functions), never stored mutable state. Start as plain SQL views (correct, simple); promote to materialized views **only when measured slow** (you won't be, at your scale). Cache at the app layer instead (§9).

### 7.1 `fn_is_received(status)` — defined once
true: `received,confirmed,client_paid,in_team_accounts`; false: `due,overdue`. Every money rollup calls it.

### 7.2 Billing rollups
- **Milestone:** agreed = `price`; received = SUM(payments WHERE milestone_id=M AND fn_is_received); outstanding = agreed-received; %.
- **Project:** agreed = linked deal's `deal_value` (the contract); received = SUM(payments WHERE project_id=P OR milestone of P, AND fn_is_received); outstanding; %. (Soft check flags when SUM(milestone prices) != deal_value, never blocks.)
- **Deal:** agreed = `deal_value`; received = SUM(payments WHERE deal_id=D AND fn_is_received).
- **Attribution rule (no double-count):** a payment counts toward its deal always; its project if `project_id` set OR its milestone belongs to that project; its milestone if `milestone_id` set.
Views: `v_deal_billing`, `v_project_billing`, `v_milestone_billing`.

### 7.3 Progress rollups (TASK-COUNT ONLY — Decision 3a)
- **`fn_milestone_pct`** = done_tasks / total_tasks (no hours term).
- **`fn_project_pct`** = task-count-weighted across its milestones = SUM(done_tasks)/SUM(total_tasks) over the project's milestones.
- Hours spent (`v_*_hours`) is computed and displayed but **never** enters completion.
Views: `v_milestone_progress`, `v_project_progress`, `v_*_hours`.

### 7.4 `fn_schedule_state(start,target,actual,pct,status)`
delivered/done -> `Delivered`; target<today & not complete -> `Overdue Nd`; target-today<=7 -> `Due in Nd`; else `On track`. Used by projects/milestones/tasks.

### 7.5 Entity rollup views (headers + list columns)
`v_contact_rollup`, `v_company_rollup`, `v_user_rollup`, `v_deal_rollup`, `v_project_rollup`, `v_milestone_rollup`, `v_task_rollup`. (`v_user_rollup` includes revenue_month, avg_rating, workload-by-status, current availability.)

### 7.6 Deep polymorphic views
`v_contact_attachments_deep(contact_id)` = attachments on the contact + its deals + its projects/milestones/tasks (the UNION written once). Analogous deep notes/conversation. App never hand-writes the UNION.

---

## 8. The AI layer (this is the core of the system)

AI is a **multi-agent supervisor** over clean data, with humans confirming anything that touches a person or client. This section is as load-bearing as the schema — the data model above exists partly to make this layer reliable. Garbage data -> garbage AI; the clean spine is the precondition.

### 8.1 Principle: deterministic-first, AI-second
The biggest cost and reliability lever. **Anything computable in SQL is computed in SQL — for free, instantly, never hallucinated.** AI is invoked only where language understanding is genuinely required.
- **Deterministic (SQL, no tokens):** payment overdue 10/20/30/45 days, hours over budget, milestone stalled (no task movement in N days), tests missing (< 3 dev / < 3 UAT), milestone past target, developer availability windows. These produce `ai_insights` rows (kind=blocker/highlight, generated_by could even be 'human'/'system') **without an LLM call.**
- **AI (LLM via OpenRouter):** is this client unhappy? is the conversation drifting out of scope? is the client scope-creeping? does this delivery meet the SOP? fair rating of a task against parameters? the daily digest narrative. **Only flagged/relevant items reach the LLM** (pre-filtered by SQL).

### 8.2 Multi-agent architecture (not a monolith)
An **orchestrator** coordinates specialized agents, each with its own state and scope. Implemented with an agentic framework (Claude Agent SDK or equivalent) running as **Cloudflare Workers on Cron Triggers** (off the request path; AI latency never blocks a page). Agents:

- **Observer agent** — reads recent `conversation_entries` (per client/project) + entity state; detects sentiment, scope drift, dissatisfaction, silence; writes `ai_insights` (blockers/highlights) with `source_evidence`. Pre-filtered: only conversations the deterministic layer flags as worth examining, and only *new* messages since last run (incremental — see 8.7).
- **Allocator agent** — when a follow-up is needed (client owes a reply, a blocker needs a PM action, a test is missing), **proposes a task** assigned to the right person (PM follows up with client; dev fixes; etc.), written to `ai_actions` as a *proposal*. On human confirm, it materializes a `tasks` row (`ai_created=true`) and fires the **outbound n8n webhook** to notify the assignee on WhatsApp/Teams/Slack (§10).
- **Rater agent** — rates tasks/milestones/projects/clients against **set parameters + SOP criteria** (8.4), impartially, writing `ratings` rows with `rater_type='ai'` and `rating_basis` (the scored criteria). Removes human bias; auditable. (Human directional ratings still exist alongside.)
- **Timeline agent** — builds the **project timeline** (8.5): classifies each stretch as *our-work* vs *waiting-on-client* vs *blocked*, from message gaps + status changes; computes who caused how much delay; surfaces client-facing escalations.
- **Digest agent** — generates per-person and per-PM/management **daily digests** (8.6): planned-vs-actual (from timesheet/time_logs), today/tomorrow/week plan, flags.

The **orchestrator** sequences these nightly (and on-demand), shares context (retrieved via embeddings, 8.7), enforces the human-in-the-loop gate, and writes a run record.

### 8.3 `ai_actions` — the human-in-the-loop spine
Every AI action that touches a person/client is a **proposal first**. `id` · `agent` enum (`observer|allocator|rater|timeline|digest`) · `action_type` enum (`create_task|rate|flag|escalate|message|summarize`) · `status` enum (`proposed|confirmed|rejected|auto_applied`) · `target_type`,`target_id` (what it acts on) · `payload` jsonb (the proposed task/rating/message) · `evidence` jsonb (what it read to decide) · `proposed_at` · `decided_by` uuid FK->users null · `decided_at` · `result_ref` (the row it created on confirm). Read-only/low-risk insights can be `auto_applied`; anything creating a task, rating a person, or messaging a client is `proposed` and waits. This table is also how you **distinguish AI-driven from human-driven** changes and **debug/trust** the agent.

### 8.4 `sop_documents` — the rules the AI checks reality against
"Is this in scope per the SOP?" requires the SOPs to exist as data. `id` · `title` · `category` enum (`scope|delivery_standard|payment_terms|testing|onboarding|escalation|...`) · `body` (Markdown) · `version` · `is_active` · `created_at` · `updated_at` · `archived_at`. **Embedded** (8.7) so agents retrieve relevant SOP chunks when judging scope/quality/delivery.
**SOPs to author (recommended starting set):** (1) Scope definition & change-control (what's in/out, how scope changes are agreed) — *directly powers scope-creep detection*; (2) Delivery standard & client handover (what "delivered" means, the delivery package); (3) Testing SOP (the 3-dev/3-UAT minimum, what each must cover); (4) Payment terms & follow-up cadence (when to chase, escalation steps) — *powers the payment-chasing*; (5) Client onboarding & credential collection (kickoff, what we need, timelines); (6) Communication & response-time SOP (channels, expected turnaround) — *powers silence/delay detection*; (7) Escalation SOP (when/how to escalate a stuck project or non-responsive client).

### 8.5 Project timeline — the delay-attribution feature
The biggest operational pain: projects hang for weeks, and clients blame us for delays that were *their* wait time. The timeline makes the truth visible to everyone, including the client.

`project_timeline_events`: `id` · `project_id` FK->projects · `event_type` enum (`contract_start|credential_requested|credential_received|kickoff_call|work_started|waiting_on_client|client_responded|blocked|milestone_done|delivered|...`) · `started_at` · `ended_at` null · `attributed_to` enum (`us|client|external|none`) · `duration_hours` (derived from start/end) · `detail` text · `source_evidence` jsonb (the messages/status-changes that justify the classification) · `created_at`.
- The **timeline agent** populates this from `conversation_entries` gaps + status changes: it marks **cutoff points** where we *started waiting on the client* (we asked, they went silent) vs where *we were actively working* vs *blocked*.
- Derived: **total delay attributed to client vs to us vs external**, production time vs wait time. Surfaced as a **visualized timeline** on the project (internal) and, crucially, on the **client portal** (client-safe): "the deadline was 7 days; here is where the 30 days went — X days waiting on your credentials, Y days awaiting your response, Z days our production." 
- Drives **proportionate reminders/escalations to the client** (via n8n outbound) when *they* are the bottleneck, with the evidence to back it.
This single feature is designed to end the "you didn't deliver on time" disputes by showing dependency-accumulated delay objectively.

### 8.6 `digests` — replacing the morning standup
`id` · `subject_type` enum (`user|pm|management`) · `subject_id` uuid null · `period_date` date · `body` (Markdown narrative) · `metrics` jsonb (planned-vs-actual hours, tasks done/in-progress/blocked, what's due today/tomorrow/this week) · `generated_at`. Generated by the digest agent nightly, connecting to **timesheet/time_logs**: what they were *supposed* to work on today, what they *actually* did, and their plan for today/tomorrow/the next week. Per-person digests for the team; rolled-up briefings for PMs and management. This is the concrete payoff: less time in standups, the supervision handled by AI.

### 8.7 Vectorization strategy (pgvector) — selective, chunked, incremental
You raised the right concern: hundreds of messages per client/project. The strategy keeps quality high and storage tiny (well inside Neon).

**`embeddings` table (polymorphic):** `id` · `parent_type`,`parent_id` · `chunk_index` · `content_chunk` text · `embedding vector(512)` · `model` · `created_at`. HNSW index on `embedding`. Composite `(parent_type,parent_id)`.

Rules:
1. **Vectorize selectively.** Embed what semantic search actually helps: `conversation_entries`, `sop_documents`, `notes`, `requirements`, document *summaries*. **Do not** embed task-status changes or short structured fields (keyword/SQL finds those).
2. **Chunk + summarize, never dump.** Full documents stay on **Google Drive**; only chunks (~500-1000 tokens) + an AI summary get embedded. A 40-page doc -> a handful of chunks + one summary, not 40 pages in the DB.
3. **Incremental.** Maintain a **rolling AI summary per conversation**; each nightly run embeds/processes only **new** messages against the existing summary — not the whole history. This is the single biggest token *and* storage saver for the "hundreds of messages" problem.
4. **Dimension-conscious.** Use a 512-dim embedding (`text-embedding-3-small` reduced) — ~1/3 the storage of 1536 with negligible retrieval loss. At ~5,000 chunks that's ~10MB raw + index — trivial in Neon. If ever tight, dimension reduction is the first free lever before paying for more storage.
5. **Hybrid queries.** Because pgvector is *in* Postgres, agents combine semantic search with SQL filters in one query ("similar discussions **for this client's projects only**") — the reason a separate vector service wasn't chosen.

An **`embed` edge/worker job** decides, per the rules above, what to embed and when (nightly + on significant new content), calling OpenRouter/embedding model. It is the agent layer's retrieval substrate.

### 8.8 Token-optimization discipline (keeps AI cost ~$30-80/mo, not $300+)
- Pre-filter with SQL; never analyze healthy/on-track/paid-up entities.
- Incremental summaries; process only new messages.
- Cheap model for triage ("worth a closer look?"), strong model only for flagged judgment.
- Cache embeddings (embed once).
- Batch nightly; on-demand only for explicit user asks.


---

## 9. Caching strategy (seamless experience for all roles)

Goal: developers, PMs, users, and clients all get fast renders; nobody waits. Pairs with "computed, not stored" — compute once, cache the result, invalidate on relevant writes.

- **What to cache:** the rollup views (billing, completion, `v_*_rollup`) and list pages — these change infrequently relative to read frequency. A project's billing/completion doesn't change every second.
- **Where:**
  - **App layer (primary):** server-action results + React Query/SWR on the client for rollups; short TTL (seconds-to-minutes) with invalidation on the relevant mutation. This is the main speed win.
  - **Edge (Cloudflare):** static assets + cacheable GET responses at the edge — near-instant for globally-distributed clients.
  - **DB:** Postgres plan/result caching is automatic; Neon's connection pooling (the serverless driver) keeps cold-start low even with scale-to-zero.
- **Invalidation:** keyed by entity — a write to a payment invalidates that deal/project/milestone's billing cache; a task status change invalidates that milestone/project's progress cache. Keep keys derived from the spine so invalidation is precise, not blunt.
- **Principle:** cache the *derived* layer aggressively, keep the *source* tables live. Never cache RLS-sensitive data across users (cache per-role/per-user where the projection differs).

---

## 10. Ingress / egress (inbound + outbound)

The system both receives data from outside and triggers outside actions. Built so sources are pluggable.

**Inbound (into the system):**
- **Conversations** from multiple platforms (WhatsApp/Unipile, Slack, Gmail/Outlook, Upwork, Fireflies/Zoom/Meet) -> n8n/Make normalize -> POST to a secured inbound endpoint -> insert `conversation_entries` (dedupe on `external_message_id`).
- **Deal / contract data** from deals, the Upwork platform, etc. -> inbound endpoints -> `deals`/`contacts`.
- All inbound endpoints are **authenticated** (signed/secret) and **edge-runtime handlers**; they validate, then write through the same RLS-aware paths (or service role for trusted ingest, with the write audited).

**Outbound (system triggers external actions):**
- On AI task creation (after human confirm), on escalations, on reminders -> fire an **n8n webhook** (external call to an n8n scenario) -> n8n notifies the developer/PM/client on **WhatsApp / Teams / Slack** or wherever configured.
- The **client timeline escalations** (8.5) and **payment-chase reminders** (deterministic + SOP cadence) also go out via n8n.
- Outbound calls are recorded (audit) so we know what was sent.

This keeps integration logic in n8n (its job) and the app focused on data + AI.

---

## 11. Integrity triggers (the guardrails)

Implement once; these make the polymorphic + cached-pointer + computed design safe:
1. **`fn_validate_parent`** (BEFORE INSERT/UPDATE on every polymorphic table) — `(parent_type,parent_id)` must resolve.
2. **`fn_cache_spine_pointers`** (BEFORE INSERT/UPDATE on deals, projects, milestones, tasks, payments, time_logs) — fills denormalized `contact_id`/`company_id`/`project_id`/`milestone_id` from the true parent. The cache can never disagree with source. *Makes Decision 1 safe.*
3. **`fn_backfill_company_on_contact`** (AFTER UPDATE on contacts when `company_id` changes) — re-runs the cache fill across that contact's deals/projects/milestones/payments, so attaching a company *later* propagates to existing children. *Makes "company is optional, attach anytime" safe.*
4. **`fn_touch_updated_at`** — sets `updated_at=now()` on UPDATE (honest freshness for field-level auto-save).
5. **`fn_assign_display_id`** (BEFORE INSERT) — formats human numbers; global sequences for CT/CO/DL/pr/T/PMT, per-project counter for M#.
6. **`fn_check_rating_direction`** (BEFORE INSERT/UPDATE on ratings, **human** rater only) — enforces admin->pm, pm->developer.
7. **`fn_audit`** (AFTER INSERT/UPDATE/archive on audited tables) — writes to `audit_log` (§12).
8. **`fn_orphan_sweep`** (scheduled) — backstop; near-irrelevant since nothing is hard-deleted.

Triggers 1-7 inline (cheap, correctness-critical); 8 scheduled.

---

## 12. Audit & access logging (a core requirement)

Two trails:

**`audit_log` (comprehensive, the main one):** `id` · `actor_type` enum (`human|ai|system`) · `actor_user_id` uuid null (null for ai/system) · `entity_type` · `entity_id` · `action` enum (`create|update|archive`) · `changed_fields` jsonb (old->new for updates) · `at` timestamptz · `agent` text null (which AI agent, if actor_type=ai). 
- **Captured:** all **creates, updates, patches, archives** across every module — **including AI generations** (an `ai_actions` confirm that writes a task/rating also logs here with `actor_type='ai'`).
- **NOT captured:** ordinary reads (every page view would bloat the DB and slow things). 
- **Sensitive reads ARE captured** — credential reveals (via `credential_access_log`) and financial-data reads where required — but not general reads. (Decision: all writes + sensitive reads, never every read.)
Written by the `fn_audit` trigger; this is *another* reason for Postgres (trivial there). 

**`credential_access_log` (specialized):** every credential reveal -> one row (`credential_id`, `user_id`, `accessed_at`, `ip`), independent of permission (even admin reveals logged). The mandatory secret-access trail.

---

## 13. Archive (not delete) & data lifecycle

- **`archived_at timestamptz` on every table**; "deleting" = set it. Base views filter `archived_at IS NULL`. Archived records remain queryable (filters/reports) and preserve referential safety.
- **No hard-delete capability anywhere** — not admin, not UI. (Legal erasure, if ever needed, is a separate deliberate logged operation, out of band.)
- Because parents never disappear, polymorphic children never orphan (the sweep is a backstop). This removes an entire class of "where did it go" bugs and keeps the system auditable by default.

---

## 14. Rich text, currency, types

- **Rich text = Markdown, constrained set:** bold, italic, underline, H1/H2/H3, normal. No HTML (no stored-HTML XSS surface). Underline stored via a small convention (Markdown has no native underline). Used for: about, overview, requirement, details, notes, feedback, SOP bodies, digest bodies.
- **Currency = per-record `currency` (char 3 ISO-4217) + `amount numeric(14,2)`.** One currency per client/project in practice (US->USD, AU->AUD, CA->CAD). Sums shown **per currency**, never mixed. No FX table in v1.
- **Money = `numeric`, never float. Time = minutes (int), render hours. Timestamps = `timestamptz`, store UTC, render in IST.**

---

## 15. Edge functions / server actions (minimal privileged surface)

Most of the app is RLS-protected server actions direct to Postgres (your existing zero-`route.ts` pattern), edge-runtime-compatible. Privileged/off-request-path pieces only:
1. **`reveal_credential`** — checks auth, writes `credential_access_log`, decrypts (pgcrypto), returns secret. The only path to plaintext. Service role.
2. **`upload_attachment`** — proxies file to the n8n Google-Drive webhook, stores URL + `drive_file_id`. Drive secrets stay in n8n.
3. **`send_message`** — delivers via n8n/Unipile/Slack/Gmail, then records `conversation_entries`. (v1 may record-only; schema supports both.)
4. **AI worker jobs (Cloudflare Workers + Cron):** the orchestrator + agents (observer/allocator/rater/timeline/digest) and the **`embed`** job. Off the request path; service role; call OpenRouter.
5. **Inbound ingest endpoints** (§10) — authenticated, validate, write (audited).

Keeping this surface small is deliberate; each privileged piece is auditable.

---

## 16. Scalability, sustainability, limitations (honest assessment)

**For 30-40 people, 40-50 projects/mo, ~500 existing projects to migrate (tasks not yet), light interaction:** comfortably within scale. This is small-data; a single Neon instance with scale-to-zero handles it without strain. The architecture is mildly over-engineered for today — the correct error for something relied on long-term.

**Flexibility (the strongest property):** adding a module is mostly free — new `entity_type` enum member -> instantly works with all five polymorphic modules; new relationship -> follows the spine + cache trigger; new metric -> a view, additive. Positive flexibility, versus the old build's negative flexibility.

**Known limitations (stated plainly):**
- Polymorphic FKs aren't natively enforced by Postgres — mitigated by enum + trigger + (archive-not-delete making orphans near-impossible). Right tradeoff at this scale.
- Rollup views are correct but not infinitely fast; materialize *only if measured slow* (you won't be). Cache at app layer first.
- RLS adds tiny per-query overhead — correct posture, worth it.
- Cloudflare edge runtime forbids Node-only APIs — handled by writing edge-native from day one + Neon serverless driver (not a workaround, a constraint adopted upfront).
- AI **action** autonomy (vs flagging) is a trust/safety bar — start with flag + propose-confirm; graduate specific actions to `auto_applied` only once trusted. Schema supports both.
- Google Drive is a managed dependency (the n8n pipeline, Drive auth, link/permission changes) — `drive_file_id` lets us re-resolve; budget light ongoing attention.

**Cost & no-surprise guarantee:** Neon Launch with a **spend cap set** = the bill cannot exceed your ceiling; scale-to-zero + text-only data keeps usage low; backups are cents. Cloudflare hosting ~$0. The only actively-managed cost is AI tokens, controlled by §8.8. All-in ~$45-95/mo, capped where it matters.

**Verdict:** future-ready as a foundation; the AI layer is built in as a first-class part (not retrofitted); host-portable so never locked in; surprise-bill-proof by design.

---

## 17. Migration & data import

- **Q1 = rebuild clean** (confirmed). Authored as numbered migrations from this doc: `0000_extensions` (pgcrypto, pgvector) · `0001_enums` · `0002_core_tables` · `0003_polymorphic` · `0004_ai_layer` (ai_insights, ai_actions, sop_documents, project_timeline_events, digests, embeddings) · `0005_triggers` · `0006_rollup_views` · `0007_projections` (dev-safe, client-safe views) · `0008_rls` · `0009_audit` · `0010_seed` (enums, apps catalog, a few users, SOP stubs).
- **Existing data:** ~500+ projects exist (tasks **not** migrating yet — client projects + similar first). A one-time ETL maps old records -> new schema. Bounded and far easier against a clean, documented target. Authored after migrations land.
- **Ongoing volume:** ~40-50 new projects/month — well within scale; the spend cap + caching keep it smooth.

---

## 18. Build order (what comes after this doc)

1. **`ARCHITECTURE.md`** ← you are here (schema + AI + security + stack source of truth).
2. **Migration set** (§17) — the SQL.
3. **ETL** — old projects -> new schema.
4. **Design system** — tokens (color, type, spacing, radius, elevation) created **fresh, bottom-up** (Golden Rule 1 — no inheritance from old screens). *This is the artifact that fixes "new CSS won't merge into a core" — there must be a token core to merge into.*
5. **Component contracts** — the universal cards (Attachments, Notes, Conversation, AI Highlights, Billing, the field-level auto-save input, the timeline visualizer) specified once.
6. **Screen specs / fresh design** — every screen rebuilt new on the token system. (The full UX redesign you want lives here, after data + tokens are locked — never before.)
7. **AI agent build** — orchestrator + agents (§8), the propose-confirm loop, SOP authoring, embeddings job.
8. **Claude Code scaffolding** — `CLAUDE.md` (always-loaded rules incl. schema-discipline, security, archive-not-delete, edge-runtime), `PLAN.md` (phase plan), **skills** (e.g. `migration-author`, `rls-policy`, `component-builder`, `agent-author`), and the **subagent structure** (orchestrator + hands-off workers) with a **UI-verification step baked in** so "UI doesn't align after deploy" is caught automatically.

Each is a separate, focused deliverable. One at a time, verify, advance.

---

## Appendix A — Decisions locked (from rounds 1-4)

- **Ownership is always a join table (multi-owner): `contact_owners`, `deal_owners`, `project_members`, `milestone_members`, `task_managers`, `task_assignees`; optional cached primary-owner pointer for headers.** · **Workload B is multi-model/model-agnostic (OpenRouter: cheap Kimi-tier for triage + stronger model for flagged judgment); Workload A is Claude Code.** · Rebuild clean (not adapt). · Task numbering **global**. · Project agreed value = deal's `deal_value` (soft-check vs milestone-price sum). · **Milestone & project completion = task-count only, hours never feed completion.** · Rich text = constrained Markdown. · Currency = per-record, one per client, per-currency sums. · **No deletion ever — archive only.** · **One passwordless auth (magic-link/OTP) for all roles**, email-bound (removal kills access). · **Credentials encrypted at rest (pgcrypto) + access-control + mandatory reveal-logging.** · Audit = all writes + sensitive reads, **never every read**. · **Developers: hard wall on finance/deals/contacts/companies/payments** — delivery work + polymorphic modules + own ratings/time + credential-reveal only. · **PMs: full payments + credentials-reveal + contacts/companies/deals; aggregate hours not raw time rows.** · **Sales: read across, write own, cannot create projects.** · **Only finance confirms payments.** · **Client portal** (own data, client-safe, with the delay-attribution timeline). · **AI-first multi-agent** (observer/allocator/rater/timeline/digest + orchestrator), **human-in-the-loop** for person/client-facing actions, **AI ratings impartial with recorded basis**, **SOP knowledge base**, **daily digests** tied to timesheet, **project-timeline delay attribution**. · **Stack:** Neon Postgres (spend-capped) + Cloudflare Pages (edge-native) + Auth.js + Neon serverless driver + Google Drive (files) + Cloudflare Workers/Cron (AI jobs) + n8n (in/out bridge) + OpenRouter (LLM). · Caching at app + edge layers, invalidate by spine key. · Host-portable (plain Postgres).

*End of foundation v2. Nothing is built against the database until the schema agrees with this document.*
