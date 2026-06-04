-- Migration 0002 | core_tables | Create core entity tables and display-ID sequences | Depends: 0001
--
-- FORWARD-REFERENCE STRATEGY:
--   users is needed by companies (account_owner_id), contacts (primary_owner_id),
--   deals, milestones, tasks, and all join tables in 0003.
--   To avoid circular references, we create a MINIMAL users stub here with only
--   the columns needed for FK resolution. The full users definition (all columns)
--   is completed in 0005 via ALTER TABLE ADD COLUMN statements.
--   This is the cleanest approach: no DEFERRABLE FKs on the critical spine.
--
-- DEFERRED FKs (added in later migrations):
--   companies.account_owner_id  -> users(id)  added in 0005
--   contacts.primary_owner_id   -> users(id)  added in 0005
--   deals.primary_owner_id      -> users(id)  added in 0005
--   projects.project_manager_id -> users(id)  added in 0005
--   milestones.milestone_manager_id -> users(id) added in 0005
--   tasks.primary_pm_id         -> users(id)  added in 0005
--   tasks.ai_action_id          -> ai_actions(id) added in 0006

BEGIN;

-- ============================================================
-- SEQUENCES for human-readable display IDs
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS seq_company_display START 201;
CREATE SEQUENCE IF NOT EXISTS seq_contact_display START 101;
CREATE SEQUENCE IF NOT EXISTS seq_deal_display    START 1;
CREATE SEQUENCE IF NOT EXISTS seq_project_display START 1;
CREATE SEQUENCE IF NOT EXISTS seq_task_display    START 1;
CREATE SEQUENCE IF NOT EXISTS seq_payment_display START 1;
CREATE SEQUENCE IF NOT EXISTS seq_user_display    START 1;

-- ============================================================
-- USERS STUB (minimal — fully expanded in 0005)
-- Created early so FKs from companies/contacts/deals/milestones/tasks resolve.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  role       user_role NOT NULL DEFAULT 'viewer',
  archived_at timestamptz
);

-- ============================================================
-- COMPANIES (CO-201+)
-- account_owner_id FK -> users added in 0005 after users is fully defined.
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id   text        UNIQUE NOT NULL,
  name         text        NOT NULL,
  website      text,
  industry     text,
  company_size company_size,
  city         text,
  state        text,
  country      text,
  type         company_type,
  -- account_owner_id: cached convenience FK; NOT authoritative (company has no single-owner join table yet).
  -- FK to users(id) added via ALTER TABLE in 0005.
  account_owner_id uuid,
  about        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);

-- ============================================================
-- CONTACTS (CT-101+)
-- primary_owner_id: cached convenience pointer, NOT authoritative.
-- Authoritative ownership = contact_owners join table (0003).
-- company_id: optional; attach anytime; backfill trigger propagates.
-- primary_owner_id FK -> users(id) added in 0005.
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id               text        UNIQUE NOT NULL,
  full_name                text        NOT NULL,
  email                    text,
  phone                    text,
  whatsapp                 text,
  slack_id                 text,
  teams_channel            text,
  teams_channel_id         text,
  country                  text,
  city                     text,
  state                    text,
  main_platform            platform,
  status                   contact_status NOT NULL DEFAULT 'prospect',
  rating                   contact_rating,
  -- Cached convenience pointer for fast list header. NOT authoritative.
  -- FK added in 0005.
  primary_owner_id         uuid,
  -- NULLABLE: company is always optional; leads/solo clients have none.
  company_id               uuid        REFERENCES companies(id) ON DELETE RESTRICT,
  about                    text,
  is_client_portal_enabled boolean     NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  archived_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id)
  WHERE company_id IS NOT NULL;

-- ============================================================
-- DEALS (DL-####)
-- company_id: CACHED from contact.company_id; maintained by fn_cache_spine_pointers trigger.
-- primary_owner_id: cached convenience pointer, NOT authoritative.
-- Authoritative ownership = deal_owners join table (0003).
-- FK for primary_owner_id -> users(id) added in 0005.
-- ============================================================
CREATE TABLE IF NOT EXISTS deals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id       text        UNIQUE NOT NULL,
  name             text        NOT NULL,
  contact_id       uuid        NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  -- CACHED from contact.company_id; trigger-maintained; never hand-set.
  company_id       uuid        REFERENCES companies(id),
  -- Cached convenience pointer. NOT authoritative. FK added in 0005.
  primary_owner_id uuid,
  payment_type     payment_type,
  deal_value       numeric(14,2),
  currency         char(3),
  stage            deal_stage  NOT NULL DEFAULT 'new',
  close_date       date,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_deals_contact_id  ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_company_id  ON deals(company_id)  WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_stage       ON deals(stage)       WHERE archived_at IS NULL;

-- ============================================================
-- PROJECTS (pr-####, lowercase display_id)
-- contact_id, company_id: CACHED; trigger-maintained.
-- project_manager_id: optional cached lead PM for header only.
--   Authoritative team = project_members (role='pm') join table in 0003.
-- FK for project_manager_id -> users(id) added in 0005.
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id                          uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id                  text            UNIQUE NOT NULL,
  name                        text            NOT NULL,
  -- NULLABLE: internal projects have no deal.
  deal_id                     uuid            REFERENCES deals(id) ON DELETE RESTRICT,
  -- CACHED from deal.contact_id; nullable for internal projects.
  contact_id                  uuid            REFERENCES contacts(id),
  -- CACHED from deal.company_id; nullable for internal projects.
  company_id                  uuid            REFERENCES companies(id),
  status                      project_status  NOT NULL DEFAULT 'upcoming',
  start_date                  date,
  estimated_completion_date   date,
  actual_completion_date      date,
  estimated_hours             numeric(8,1),
  team_logger_project_name    text,
  team_logger_project_id      text,
  -- Optional cached lead PM for display headers ONLY. NOT authoritative.
  -- FK added in 0005.
  project_manager_id          uuid,
  requirement                 text,
  overview                    text,
  -- Per-project milestone sequence counter. Incremented by fn_assign_display_id trigger.
  next_milestone_seq          int             NOT NULL DEFAULT 0,
  created_at                  timestamptz     NOT NULL DEFAULT now(),
  updated_at                  timestamptz     NOT NULL DEFAULT now(),
  archived_at                 timestamptz
);

CREATE INDEX IF NOT EXISTS idx_projects_deal_id    ON projects(deal_id)    WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_contact_id ON projects(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status)     WHERE archived_at IS NULL;

-- ============================================================
-- MILESTONES (M#, scoped per project — UNIQUE per project)
-- contact_id, company_id: CACHED from project; trigger-maintained.
-- milestone_manager_id: optional override; defaults from project PM.
-- FK for milestone_manager_id -> users(id) added in 0005.
-- ============================================================
CREATE TABLE IF NOT EXISTS milestones (
  id                     uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  -- e.g. 'M1', 'M2'. Unique per project; generated by trigger using projects.next_milestone_seq.
  display_id             text             NOT NULL,
  name                   text             NOT NULL,
  project_id             uuid             NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  -- CACHED from project.contact_id; trigger-maintained.
  contact_id             uuid             REFERENCES contacts(id),
  -- CACHED from project.company_id; trigger-maintained.
  company_id             uuid             REFERENCES companies(id),
  status                 milestone_status NOT NULL DEFAULT 'not_started',
  -- Optional override; defaults from project_manager_id on parent project.
  -- FK added in 0005.
  milestone_manager_id   uuid,
  start_date             date,
  target_date            date,
  actual_completion_date date,
  estimated_hours        numeric(8,1),
  price                  numeric(14,2),
  currency               char(3),
  created_at             timestamptz      NOT NULL DEFAULT now(),
  updated_at             timestamptz      NOT NULL DEFAULT now(),
  archived_at            timestamptz,
  UNIQUE (project_id, display_id)
);

CREATE INDEX IF NOT EXISTS idx_milestones_project_id  ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_contact_id  ON milestones(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_milestones_company_id  ON milestones(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_milestones_status      ON milestones(status)     WHERE archived_at IS NULL;

-- ============================================================
-- TASKS (T-# global numbering)
-- parent_type restricted to milestone/deal/payment per architecture.
-- project_id, milestone_id, contact_id, company_id: CACHED via trigger.
-- primary_pm_id: cached convenience pointer. NOT authoritative.
--   Authoritative PMs = task_managers join table (0003).
-- ai_action_id FK -> ai_actions(id) added in 0006 (ai_actions created there).
-- primary_pm_id FK -> users(id) added in 0005.
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id                   uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id           text               UNIQUE NOT NULL,
  title                text               NOT NULL,
  -- Polymorphic parent: milestone (delivery task), deal (sales follow-up), payment (payment follow-up).
  parent_type          entity_type        NOT NULL
    CHECK (parent_type IN ('milestone', 'deal', 'payment')),
  parent_id            uuid               NOT NULL,
  -- CACHED when parent_type='milestone'. All nullable-until-trigger-fires.
  project_id           uuid               REFERENCES projects(id),
  milestone_id         uuid               REFERENCES milestones(id),
  -- CACHED across the spine; trigger-maintained.
  contact_id           uuid               REFERENCES contacts(id),
  company_id           uuid               REFERENCES companies(id),
  status               task_status        NOT NULL DEFAULT 'todo',
  delivery_state       task_delivery_state NOT NULL DEFAULT 'not_delivered',
  priority             priority           DEFAULT 'medium',
  -- Cached convenience pointer. NOT authoritative. FK added in 0005.
  primary_pm_id        uuid,
  start_date           date,
  plan_due_date        date,
  execution_start_date date,
  execution_end_date   date,
  -- Planned/quoted hours on this task. Time SPENT is derived from time_logs — never stored here.
  time_reported_hours  numeric(8,1),
  requirement          text,
  details              text,
  ai_created           boolean            NOT NULL DEFAULT false,
  -- FK to ai_actions(id) added in 0006 after ai_actions table exists.
  ai_action_id         uuid,
  created_at           timestamptz        NOT NULL DEFAULT now(),
  updated_at           timestamptz        NOT NULL DEFAULT now(),
  archived_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tasks_parent       ON tasks(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id   ON tasks(project_id)   WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON tasks(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id   ON tasks(contact_id)   WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status)       WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks(status, priority) WHERE archived_at IS NULL;

COMMIT;
