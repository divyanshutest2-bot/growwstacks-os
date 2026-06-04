-- Migration 0003 | ownership_joins | Create all join tables for multi-owner relationships | Depends: 0002
--
-- DESIGN NOTE: ownership join tables do NOT have archived_at.
-- Membership IS the state; removing a member row ends membership cleanly.
-- This is the explicit, documented exception to the archive-only rule.
-- The rule "no DELETE" applies to entity records; join-table rows are the
-- relationship fact itself, not an entity.
--
-- FK to users(id) is safe here: users stub was created in 0002.

BEGIN;

-- ============================================================
-- CONTACT_OWNERS — multiple users may own a contact
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_owners (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid        NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  user_id    uuid        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_owners_contact ON contact_owners(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_owners_user    ON contact_owners(user_id);

-- ============================================================
-- DEAL_OWNERS — multiple users may own a deal
-- ============================================================
CREATE TABLE IF NOT EXISTS deal_owners (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    uuid        NOT NULL REFERENCES deals(id) ON DELETE RESTRICT,
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_owners_deal ON deal_owners(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_owners_user ON deal_owners(user_id);

-- ============================================================
-- PROJECT_MEMBERS — role in ('pm', 'developer')
-- This is the authoritative source for project team membership.
-- projects.project_manager_id is a cached convenience for display only.
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL REFERENCES projects(id)  ON DELETE RESTRICT,
  user_id    uuid        NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
  role       user_role   NOT NULL CHECK (role IN ('pm', 'developer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user    ON project_members(user_id);

-- ============================================================
-- MILESTONE_MEMBERS — role in ('pm', 'developer')
-- Authoritative source for milestone team. milestone_manager_id on milestones is a cache.
-- ============================================================
CREATE TABLE IF NOT EXISTS milestone_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid        NOT NULL REFERENCES milestones(id) ON DELETE RESTRICT,
  user_id      uuid        NOT NULL REFERENCES users(id)      ON DELETE RESTRICT,
  role         user_role   NOT NULL CHECK (role IN ('pm', 'developer')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_milestone_members_milestone ON milestone_members(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_members_user      ON milestone_members(user_id);

-- ============================================================
-- TASK_MANAGERS — multiple PMs may manage a task
-- tasks.primary_pm_id is cached convenience for display only.
-- ============================================================
CREATE TABLE IF NOT EXISTS task_managers (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid        NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_managers_task ON task_managers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_managers_user ON task_managers(user_id);

-- ============================================================
-- TASK_ASSIGNEES — multiple developers may be assigned a task
-- ============================================================
CREATE TABLE IF NOT EXISTS task_assignees (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid        NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);

-- ============================================================
-- CONTACT_LEAD_SOURCES — multi-value lead source per contact
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_lead_sources (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid        NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  lead_source lead_source NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, lead_source)
);

CREATE INDEX IF NOT EXISTS idx_contact_lead_sources_contact ON contact_lead_sources(contact_id);

-- ============================================================
-- DEAL_TAGS — free-text tags per deal
-- ============================================================
CREATE TABLE IF NOT EXISTS deal_tags (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    uuid        NOT NULL REFERENCES deals(id) ON DELETE RESTRICT,
  tag        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_deal_tags_deal ON deal_tags(deal_id);

COMMIT;
