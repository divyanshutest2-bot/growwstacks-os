-- Migration 0005 | supporting | Complete users table + all supporting entity tables | Depends: 0004
--
-- KEY ACTIONS IN THIS FILE:
--   1. Expand users stub (created in 0002) with full column set via ALTER TABLE ADD COLUMN IF NOT EXISTS.
--   2. Add deferred FK constraints from core tables back to users (companies, contacts, deals,
--      projects, milestones, tasks) that could not be added in 0002 (circular reference).
--   3. Create: user_availability, payments, credentials, credential_links,
--      credential_access_log, tests, time_logs, apps, app_links.
--   4. Column-level credential secret revocation.
--
-- NOTE: tasks.ai_action_id FK -> ai_actions is added in 0006 (ai_actions created there).

BEGIN;

-- ============================================================
-- EXPAND USERS (stub was created in 0002; add remaining columns)
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_id       text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name        text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone            text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp         text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS teams_id         text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_logger_id   text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title        text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status           user_status NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_start      time;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_end        time;
ALTER TABLE users ADD COLUMN IF NOT EXISTS projects_requested int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at       timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();
-- archived_at already added in stub; this is a no-op if it exists.
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at      timestamptz;

-- ============================================================
-- ADD DEFERRED FK CONSTRAINTS (core tables -> users)
-- Using DEFERRABLE INITIALLY DEFERRED: validated at commit time,
-- allowing the seed in 0012 to insert all rows in one transaction.
-- ============================================================

-- companies.account_owner_id -> users(id)
DO $$ BEGIN
  ALTER TABLE companies
    ADD CONSTRAINT fk_companies_account_owner
    FOREIGN KEY (account_owner_id) REFERENCES users(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- contacts.primary_owner_id -> users(id)
-- This is a CACHED convenience pointer; the authoritative owner = contact_owners.
DO $$ BEGIN
  ALTER TABLE contacts
    ADD CONSTRAINT fk_contacts_primary_owner
    FOREIGN KEY (primary_owner_id) REFERENCES users(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- deals.primary_owner_id -> users(id)
DO $$ BEGIN
  ALTER TABLE deals
    ADD CONSTRAINT fk_deals_primary_owner
    FOREIGN KEY (primary_owner_id) REFERENCES users(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- projects.project_manager_id -> users(id)
DO $$ BEGIN
  ALTER TABLE projects
    ADD CONSTRAINT fk_projects_project_manager
    FOREIGN KEY (project_manager_id) REFERENCES users(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- milestones.milestone_manager_id -> users(id)
DO $$ BEGIN
  ALTER TABLE milestones
    ADD CONSTRAINT fk_milestones_milestone_manager
    FOREIGN KEY (milestone_manager_id) REFERENCES users(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tasks.primary_pm_id -> users(id)
DO $$ BEGIN
  ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_primary_pm
    FOREIGN KEY (primary_pm_id) REFERENCES users(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- USER_AVAILABILITY — one row per user per date
-- ============================================================
CREATE TABLE IF NOT EXISTS user_availability (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  date            date        NOT NULL,
  available_hours numeric(4,1) NOT NULL,
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_availability_user_date ON user_availability(user_id, date);

-- ============================================================
-- PAYMENTS (PMT-####) — the ONLY money facts written to the DB
-- contact_id: CACHED from deal.contact_id; trigger-maintained.
-- Only finance/admin may set status to 'confirmed'/'in_team_accounts' (enforced by RLS in 0010).
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id      text           UNIQUE NOT NULL,
  deal_id         uuid           NOT NULL REFERENCES deals(id) ON DELETE RESTRICT,
  -- Optional links for attribution in billing rollups.
  project_id      uuid           REFERENCES projects(id),
  milestone_id    uuid           REFERENCES milestones(id),
  -- CACHED from deal.contact_id; trigger-maintained; never hand-set.
  contact_id      uuid           REFERENCES contacts(id),
  amount          numeric(14,2)  NOT NULL,
  currency        char(3)        NOT NULL,
  payment_type    payment_type,
  payment_date    date,
  transaction_ref text,
  status          payment_status NOT NULL DEFAULT 'due',
  created_by      uuid           REFERENCES users(id),
  -- Null until finance confirms.
  confirmed_by    uuid           REFERENCES users(id),
  note            text,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now(),
  archived_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payments_deal_id      ON payments(deal_id);
CREATE INDEX IF NOT EXISTS idx_payments_project_id   ON payments(project_id)   WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_milestone_id ON payments(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_contact_id   ON payments(contact_id)   WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments(status)       WHERE archived_at IS NULL;

-- ============================================================
-- CREDENTIALS — client credential vault
-- secret_ref: encrypted at rest via pgcrypto. Column-level access denied below.
-- All reveals must go through the reveal_credential server action (service role),
-- which logs to credential_access_log FIRST, then decrypts.
-- ============================================================
CREATE TABLE IF NOT EXISTS credentials (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Credentials belong to a client contact.
  contact_id                  uuid        NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  label                       text        NOT NULL,
  login_url                   text,
  username                    text,
  -- ENCRYPTED at rest (pgcrypto). Column-level SELECT denied from all app roles.
  -- Only the reveal_credential action (service role) may read this column.
  secret_ref                  text,
  two_factor_enabled          boolean     DEFAULT false,
  two_factor_destination      text,
  we_have_account_access      boolean     DEFAULT false,
  our_access_account          text,
  client_credentials_available boolean    DEFAULT false,
  notes                       text,
  created_by                  uuid        REFERENCES users(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  archived_at                 timestamptz
);

CREATE INDEX IF NOT EXISTS idx_credentials_contact ON credentials(contact_id);

-- ============================================================
-- COLUMN-LEVEL SECURITY: deny secret_ref to all app roles.
-- Even if a policy grants SELECT on the table, no app role
-- can read the plaintext secret. Only the service role (superuser)
-- used by the reveal_credential server action can read it.
-- Additional per-role revokes are done in 0010 once app roles are created.
-- ============================================================
REVOKE SELECT (secret_ref) ON credentials FROM PUBLIC;

-- ============================================================
-- CREDENTIAL_LINKS — attach credentials to a contact/project/milestone
-- ============================================================
CREATE TABLE IF NOT EXISTS credential_links (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid        NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
  parent_type   entity_type NOT NULL
    CHECK (parent_type IN ('contact', 'project', 'milestone')),
  parent_id     uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credential_id, parent_type, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_credential_links_parent
  ON credential_links(parent_type, parent_id);

CREATE INDEX IF NOT EXISTS idx_credential_links_credential
  ON credential_links(credential_id);

-- ============================================================
-- CREDENTIAL_ACCESS_LOG — every reveal is logged, always
-- Written by the reveal_credential server action BEFORE decrypting.
-- Independent of permissions: even admin reveals are logged here.
-- ============================================================
CREATE TABLE IF NOT EXISTS credential_access_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid        NOT NULL REFERENCES credentials(id),
  user_id       uuid        NOT NULL REFERENCES users(id),
  accessed_at   timestamptz NOT NULL DEFAULT now(),
  ip            text
);

CREATE INDEX IF NOT EXISTS idx_cred_access_log_credential
  ON credential_access_log(credential_id);
CREATE INDEX IF NOT EXISTS idx_cred_access_log_user
  ON credential_access_log(user_id);

-- ============================================================
-- TESTS — developer tests and UAT, per milestone or task
-- ============================================================
CREATE TABLE IF NOT EXISTS tests (
  id              uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type     entity_type      NOT NULL
    CHECK (parent_type IN ('milestone', 'task')),
  parent_id       uuid             NOT NULL,
  test_type       test_type        NOT NULL,
  title           text,
  brief           text,
  outcome         test_outcome,
  tester_user_id  uuid             REFERENCES users(id),
  tester_role     tester_role_type,
  feedback_title  text,
  feedback_body   text,
  conducted_at    timestamptz,
  -- Null until test passes.
  passed_at       timestamptz,
  created_at      timestamptz      NOT NULL DEFAULT now(),
  updated_at      timestamptz      NOT NULL DEFAULT now(),
  archived_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tests_parent_type
  ON tests(parent_type, parent_id, test_type);

-- ============================================================
-- TIME_LOGS — who spent how long on what task
-- Time is in minutes (int) to avoid float drift; render as hours in the app.
-- project_id, milestone_id: CACHED from task; trigger-maintained.
-- PMs access ONLY via rollup views (aggregate hours), never raw rows.
-- ============================================================
CREATE TABLE IF NOT EXISTS time_logs (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid            NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  user_id         uuid            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  minutes         int             NOT NULL CHECK (minutes > 0),
  logged_for_date date            NOT NULL,
  source          time_log_source NOT NULL DEFAULT 'manual',
  note            text,
  -- CACHED from task.project_id and task.milestone_id; trigger-maintained.
  project_id      uuid            REFERENCES projects(id),
  milestone_id    uuid            REFERENCES milestones(id),
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  archived_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_time_logs_task_id         ON time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_user_date       ON time_logs(user_id, logged_for_date);
CREATE INDEX IF NOT EXISTS idx_time_logs_project_id      ON time_logs(project_id)   WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_logs_milestone_id    ON time_logs(milestone_id) WHERE milestone_id IS NOT NULL;

-- ============================================================
-- APPS — catalog of tools/technologies (no hardcoded names)
-- ============================================================
CREATE TABLE IF NOT EXISTS apps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        UNIQUE NOT NULL,
  icon_key    text,
  category    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

-- ============================================================
-- APP_LINKS — link apps to projects/milestones/tasks/users
-- proficiency only meaningful when parent_type='user'.
-- ============================================================
CREATE TABLE IF NOT EXISTS app_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      uuid        NOT NULL REFERENCES apps(id) ON DELETE RESTRICT,
  parent_type entity_type NOT NULL
    CHECK (parent_type IN ('project', 'milestone', 'task', 'user')),
  parent_id   uuid        NOT NULL,
  -- Only set when parent_type = 'user'.
  proficiency proficiency,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (app_id, parent_type, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_app_links_parent
  ON app_links(parent_type, parent_id);

CREATE INDEX IF NOT EXISTS idx_app_links_app
  ON app_links(app_id);

COMMIT;
