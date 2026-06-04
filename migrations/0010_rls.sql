-- Migration 0010 | rls | Enable RLS on all tables + roles + helper functions + policies | Depends: 0009
--
-- AUTH PATTERN: Neon Auth (Stack Auth) syncs identities into Postgres.
-- Server actions set identity via:
--   SELECT set_config('app.current_user_id', $user_id, true);
-- before running queries.
-- NEVER use Supabase-style auth.uid() — this is plain Postgres + Neon Auth.
--
-- CAPABILITY MATRIX (from ARCHITECTURE §6.2):
--   admin:     RW everything
--   pm:        RW projects/milestones/tasks/deals/contacts/companies; aggregate hours only
--   developer: RW only projects/milestones/tasks they're a member/assignee of
--              (via v_project_dev/v_milestone_dev/v_task_dev — money stripped)
--              ZERO access to companies, contacts, deals, payments
--   sales:     RW own contacts/deals; NO project create; read projects on own contacts
--   finance:   R all; W payments (only finance confirms); R credentials metadata
--   client:    own data only via client-safe views; read-only
--   viewer:    read-only, limited scope
--
-- HARD RULES:
--   Developers: NO SELECT policy on companies, contacts, deals, payments.
--   Sales: cannot INSERT on projects.
--   Payments confirmed_by: only finance/admin may SET confirmed/in_team_accounts.
--   time_logs: developers SELECT only WHERE user_id = fn_me().
--   PMs: no direct SELECT on time_logs (they use rollup views).
--   credentials.secret_ref: revoked from all app roles.

BEGIN;

-- ============================================================
-- CREATE POSTGRES ROLES
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_admin')     THEN CREATE ROLE role_admin;     END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_pm')        THEN CREATE ROLE role_pm;        END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_developer') THEN CREATE ROLE role_developer; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_sales')     THEN CREATE ROLE role_sales;     END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_finance')   THEN CREATE ROLE role_finance;   END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_client')    THEN CREATE ROLE role_client;    END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_viewer')    THEN CREATE ROLE role_viewer;    END IF;
END $$;

-- ============================================================
-- RLS HELPER FUNCTIONS (SECURITY DEFINER — run as owner, not caller)
-- These are the only way RLS policies query user state.
-- They read from the users table and the GUC set by the server action.
-- ============================================================

-- fn_me() — returns the current user's UUID from the session GUC
CREATE OR REPLACE FUNCTION fn_me()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

-- fn_my_role() — returns the current user's role
CREATE OR REPLACE FUNCTION fn_my_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM users WHERE id = fn_me() AND archived_at IS NULL
$$;

-- fn_is_admin() — convenience predicate
CREATE OR REPLACE FUNCTION fn_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT fn_my_role() = 'admin'
$$;

-- fn_is_member_of_project(project_id) — true if current user is in project_members
CREATE OR REPLACE FUNCTION fn_is_member_of_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = fn_me()
  )
$$;

-- fn_can_see_contact(contact_id) — access-control for contact rows
CREATE OR REPLACE FUNCTION fn_can_see_contact(p_contact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE fn_my_role()
    WHEN 'admin'     THEN true
    WHEN 'pm'        THEN true
    WHEN 'finance'   THEN true
    WHEN 'sales'     THEN true
    -- developer: hard wall — no contact access
    WHEN 'developer' THEN false
    WHEN 'viewer'    THEN false
    ELSE false
  END
$$;

-- fn_can_see(entity_type, id) — polymorphic access dispatcher
-- Routes to the correct entity-level check.
-- Used by polymorphic-table RLS policies (attachments, notes, etc.).
CREATE OR REPLACE FUNCTION fn_can_see(p_type entity_type, p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN CASE p_type
    WHEN 'contact'   THEN fn_can_see_contact(p_id)
    WHEN 'company'   THEN fn_my_role() IN ('admin','pm','finance','sales')
    WHEN 'deal'      THEN fn_my_role() IN ('admin','pm','finance','sales')
    WHEN 'project'   THEN
      fn_my_role() IN ('admin','pm','finance','sales')
      OR fn_is_member_of_project(p_id)
    WHEN 'milestone' THEN (
      SELECT fn_can_see('project'::entity_type, m.project_id)
      FROM milestones m WHERE m.id = p_id
    )
    WHEN 'task'      THEN (
      SELECT CASE t.parent_type
        WHEN 'milestone' THEN fn_can_see('milestone'::entity_type, t.milestone_id)
        ELSE fn_my_role() IN ('admin','pm','finance')
      END FROM tasks t WHERE t.id = p_id
    )
    WHEN 'payment'   THEN fn_my_role() IN ('admin','pm','finance')
    WHEN 'user'      THEN true   -- everyone reads the directory
    WHEN 'test'      THEN (
      SELECT CASE te.parent_type
        WHEN 'milestone' THEN fn_can_see('milestone'::entity_type, te.parent_id)
        WHEN 'task'      THEN fn_can_see('task'::entity_type, te.parent_id)
        ELSE false
      END FROM tests te WHERE te.id = p_id
    )
    WHEN 'note'      THEN true   -- check via parent_type/parent_id at query time
    WHEN 'rating'    THEN fn_my_role() IN ('admin','pm','finance')
    ELSE false
  END;
END;
$$;

-- fn_can_edit(entity_type, id) — write-level access dispatcher
CREATE OR REPLACE FUNCTION fn_can_edit(p_type entity_type, p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN CASE p_type
    WHEN 'contact'   THEN
      fn_my_role() = 'admin'
      OR (fn_my_role() = 'sales' AND EXISTS(
        SELECT 1 FROM contact_owners WHERE contact_id = p_id AND user_id = fn_me()
      ))
      OR fn_my_role() = 'pm'
    WHEN 'company'   THEN
      fn_my_role() IN ('admin','pm')
      OR (fn_my_role() = 'sales' AND EXISTS(
        SELECT 1 FROM contact_owners co
        JOIN contacts c ON c.id = co.contact_id
        WHERE c.company_id = p_id AND co.user_id = fn_me()
      ))
    WHEN 'deal'      THEN
      fn_my_role() IN ('admin','pm')
      OR (fn_my_role() = 'sales' AND EXISTS(
        SELECT 1 FROM deal_owners WHERE deal_id = p_id AND user_id = fn_me()
      ))
    WHEN 'project'   THEN fn_my_role() IN ('admin','pm')
    WHEN 'milestone' THEN fn_my_role() IN ('admin','pm')
    WHEN 'task'      THEN
      fn_my_role() IN ('admin','pm')
      OR (fn_my_role() = 'developer' AND EXISTS(
        SELECT 1 FROM task_assignees WHERE task_id = p_id AND user_id = fn_me()
      ))
    WHEN 'payment'   THEN fn_my_role() IN ('admin','pm','finance')
    ELSE false
  END;
END;
$$;

-- fn_is_client_for_project(project_id) — client portal: own project only
CREATE OR REPLACE FUNCTION fn_is_client_for_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(
    SELECT 1 FROM projects p
    JOIN contacts c ON c.id = p.contact_id
    WHERE p.id = p_project_id
      AND c.email = (SELECT email FROM users WHERE id = fn_me() AND archived_at IS NULL)
      AND c.is_client_portal_enabled = true
      AND p.archived_at IS NULL
  )
$$;

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE companies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials              ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_access_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_availability        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE apps                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_links                ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_owners           ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_owners              ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_managers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_lead_sources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_tags                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_actions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_timeline_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings               ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- COMPANIES POLICIES
-- admin/pm/sales/finance: read all; developer: NO policy (zero access)
-- ============================================================
DROP POLICY IF EXISTS companies_select ON companies;
CREATE POLICY companies_select ON companies FOR SELECT
  USING (fn_my_role() IN ('admin','pm','finance','sales'));

DROP POLICY IF EXISTS companies_insert ON companies;
CREATE POLICY companies_insert ON companies FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

DROP POLICY IF EXISTS companies_update ON companies;
CREATE POLICY companies_update ON companies FOR UPDATE
  USING (fn_can_edit('company'::entity_type, id));

-- No DELETE policy — archive only (UPDATE sets archived_at).

-- ============================================================
-- CONTACTS POLICIES
-- admin/pm/sales/finance: read all; developer: NO policy (zero access)
-- ============================================================
DROP POLICY IF EXISTS contacts_select ON contacts;
CREATE POLICY contacts_select ON contacts FOR SELECT
  USING (fn_my_role() IN ('admin','pm','finance','sales'));

DROP POLICY IF EXISTS contacts_insert ON contacts;
CREATE POLICY contacts_insert ON contacts FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm','sales'));

DROP POLICY IF EXISTS contacts_update ON contacts;
CREATE POLICY contacts_update ON contacts FOR UPDATE
  USING (fn_can_edit('contact'::entity_type, id));

-- ============================================================
-- DEALS POLICIES
-- admin/pm/sales/finance: read; developer: NO policy (zero access)
-- ============================================================
DROP POLICY IF EXISTS deals_select ON deals;
CREATE POLICY deals_select ON deals FOR SELECT
  USING (fn_my_role() IN ('admin','pm','finance','sales'));

DROP POLICY IF EXISTS deals_insert ON deals;
CREATE POLICY deals_insert ON deals FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm','sales'));

DROP POLICY IF EXISTS deals_update ON deals;
CREATE POLICY deals_update ON deals FOR UPDATE
  USING (fn_can_edit('deal'::entity_type, id));

-- ============================================================
-- PROJECTS POLICIES
-- admin/pm/finance/sales: read all
-- developer: read only projects they're a member of (uses fn_is_member_of_project)
-- sales: NO INSERT
-- ============================================================
DROP POLICY IF EXISTS projects_select_internal ON projects;
CREATE POLICY projects_select_internal ON projects FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm','finance','sales')
    OR (fn_my_role() = 'developer' AND fn_is_member_of_project(id))
  );

DROP POLICY IF EXISTS projects_insert ON projects;
CREATE POLICY projects_insert ON projects FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));
  -- sales cannot create projects per hard rule

DROP POLICY IF EXISTS projects_update ON projects;
CREATE POLICY projects_update ON projects FOR UPDATE
  USING (fn_can_edit('project'::entity_type, id));

-- ============================================================
-- MILESTONES POLICIES
-- Same access as project: inherits membership logic.
-- ============================================================
DROP POLICY IF EXISTS milestones_select ON milestones;
CREATE POLICY milestones_select ON milestones FOR SELECT
  USING (fn_can_see('milestone'::entity_type, id));

DROP POLICY IF EXISTS milestones_insert ON milestones;
CREATE POLICY milestones_insert ON milestones FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

DROP POLICY IF EXISTS milestones_update ON milestones;
CREATE POLICY milestones_update ON milestones FOR UPDATE
  USING (fn_can_edit('milestone'::entity_type, id));

-- ============================================================
-- TASKS POLICIES
-- admin/pm: full; developer: own assigned tasks + tasks in their projects;
-- finance/sales: read only (no write on tasks)
-- ============================================================
DROP POLICY IF EXISTS tasks_select ON tasks;
CREATE POLICY tasks_select ON tasks FOR SELECT
  USING (fn_can_see('task'::entity_type, id));

DROP POLICY IF EXISTS tasks_insert ON tasks;
CREATE POLICY tasks_insert ON tasks FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

DROP POLICY IF EXISTS tasks_update ON tasks;
CREATE POLICY tasks_update ON tasks FOR UPDATE
  USING (fn_can_edit('task'::entity_type, id));

-- ============================================================
-- PAYMENTS POLICIES
-- admin/pm/finance: read+write all; developer: NO policy (zero access)
-- sales: INSERT with status 'due'/'client_paid' only; read own deals' payments
-- HARD RULE: only finance/admin may SET confirmed/in_team_accounts
-- ============================================================
DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm','finance')
    OR (fn_my_role() = 'sales' AND EXISTS(
      SELECT 1 FROM deal_owners WHERE deal_id = payments.deal_id AND user_id = fn_me()
    ))
  );

DROP POLICY IF EXISTS payments_insert ON payments;
CREATE POLICY payments_insert ON payments FOR INSERT
  WITH CHECK (
    fn_my_role() IN ('admin','pm','finance')
    OR (fn_my_role() = 'sales' AND status IN ('due','client_paid'))
  );

DROP POLICY IF EXISTS payments_update ON payments;
CREATE POLICY payments_update ON payments FOR UPDATE
  USING (fn_my_role() IN ('admin','pm','finance'))
  WITH CHECK (
    -- Prevent any non-finance/non-admin from setting confirmed status
    CASE
      WHEN status IN ('confirmed','in_team_accounts')
        THEN fn_my_role() IN ('admin','finance')
      ELSE fn_my_role() IN ('admin','pm','finance')
    END
  );

-- ============================================================
-- CREDENTIALS POLICIES (metadata — secret_ref column revoked separately)
-- admin/pm: read all relevant; developer: read linked to their projects
-- ============================================================
DROP POLICY IF EXISTS credentials_select ON credentials;
CREATE POLICY credentials_select ON credentials FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm')
    OR (fn_my_role() = 'developer' AND EXISTS(
      SELECT 1 FROM credential_links cl
      JOIN project_members pm ON pm.project_id = cl.parent_id
      WHERE cl.credential_id = credentials.id
        AND cl.parent_type = 'project'
        AND pm.user_id = fn_me()
    ))
    OR (fn_my_role() = 'developer' AND EXISTS(
      SELECT 1 FROM credential_links cl
      JOIN milestone_members mm ON mm.milestone_id = cl.parent_id
      WHERE cl.credential_id = credentials.id
        AND cl.parent_type = 'milestone'
        AND mm.user_id = fn_me()
    ))
    OR fn_my_role() IN ('finance','sales')
  );

DROP POLICY IF EXISTS credentials_insert ON credentials;
CREATE POLICY credentials_insert ON credentials FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

DROP POLICY IF EXISTS credentials_update ON credentials;
CREATE POLICY credentials_update ON credentials FOR UPDATE
  USING (fn_my_role() IN ('admin','pm'));

-- ============================================================
-- CREDENTIAL_LINKS POLICIES
-- ============================================================
DROP POLICY IF EXISTS credential_links_select ON credential_links;
CREATE POLICY credential_links_select ON credential_links FOR SELECT
  USING (fn_my_role() IN ('admin','pm','developer','finance'));

DROP POLICY IF EXISTS credential_links_insert ON credential_links;
CREATE POLICY credential_links_insert ON credential_links FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

-- ============================================================
-- CREDENTIAL_ACCESS_LOG POLICIES
-- Write: allowed by any authorized user (the reveal action writes it).
-- Read: admin only.
-- ============================================================
DROP POLICY IF EXISTS cred_access_log_select ON credential_access_log;
CREATE POLICY cred_access_log_select ON credential_access_log FOR SELECT
  USING (fn_is_admin());

DROP POLICY IF EXISTS cred_access_log_insert ON credential_access_log;
CREATE POLICY cred_access_log_insert ON credential_access_log FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm','developer','finance','sales'));

-- ============================================================
-- USERS POLICIES
-- Everyone reads the directory; users update own profile;
-- role and status: admin-writable only.
-- ============================================================
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT
  USING (true);   -- everyone reads directory

DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (fn_is_admin());   -- only admin creates users (Neon Auth syncs)

-- WITH CHECK on UPDATE cannot reference OLD in Postgres RLS.
-- The USING clause gates which rows can be updated.
-- Role/status self-promotion is prevented by fn_prevent_role_escalation trigger (also in this migration).
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE
  USING (fn_is_admin() OR id = fn_me())
  WITH CHECK (fn_is_admin() OR id = fn_me());

-- ============================================================
-- USER_AVAILABILITY POLICIES
-- ============================================================
DROP POLICY IF EXISTS user_avail_select ON user_availability;
CREATE POLICY user_avail_select ON user_availability FOR SELECT
  USING (fn_my_role() IN ('admin','pm','developer','finance','sales'));

DROP POLICY IF EXISTS user_avail_insert ON user_availability;
CREATE POLICY user_avail_insert ON user_availability FOR INSERT
  WITH CHECK (fn_is_admin() OR user_id = fn_me());

DROP POLICY IF EXISTS user_avail_update ON user_availability;
CREATE POLICY user_avail_update ON user_availability FOR UPDATE
  USING (fn_is_admin() OR user_id = fn_me());

-- ============================================================
-- NOTES POLICIES (polymorphic — delegate to parent)
-- Client-safe: clients should NOT see internal notes at all.
-- The client-safe views simply don't expose notes. Here we block at RLS too.
-- ============================================================
DROP POLICY IF EXISTS notes_select ON notes;
CREATE POLICY notes_select ON notes FOR SELECT
  USING (fn_can_see(parent_type, parent_id));

DROP POLICY IF EXISTS notes_insert ON notes;
CREATE POLICY notes_insert ON notes FOR INSERT
  WITH CHECK (fn_can_edit(parent_type, parent_id));

DROP POLICY IF EXISTS notes_update ON notes;
CREATE POLICY notes_update ON notes FOR UPDATE
  USING (fn_can_edit(parent_type, parent_id) OR author_id = fn_me());

-- ============================================================
-- ATTACHMENTS POLICIES (polymorphic — delegate to parent)
-- ============================================================
DROP POLICY IF EXISTS attachments_select ON attachments;
CREATE POLICY attachments_select ON attachments FOR SELECT
  USING (fn_can_see(parent_type, parent_id));

DROP POLICY IF EXISTS attachments_insert ON attachments;
CREATE POLICY attachments_insert ON attachments FOR INSERT
  WITH CHECK (fn_can_edit(parent_type, parent_id));

DROP POLICY IF EXISTS attachments_update ON attachments;
CREATE POLICY attachments_update ON attachments FOR UPDATE
  USING (fn_can_edit(parent_type, parent_id));

-- ============================================================
-- CONVERSATION_ENTRIES POLICIES (polymorphic — delegate to parent)
-- ============================================================
DROP POLICY IF EXISTS conversation_select ON conversation_entries;
CREATE POLICY conversation_select ON conversation_entries FOR SELECT
  USING (fn_can_see(parent_type, parent_id));

DROP POLICY IF EXISTS conversation_insert ON conversation_entries;
CREATE POLICY conversation_insert ON conversation_entries FOR INSERT
  WITH CHECK (fn_can_edit(parent_type, parent_id));

-- ============================================================
-- AI_INSIGHTS POLICIES (polymorphic — delegate to parent)
-- Internal notes/insights stripped from client views.
-- ============================================================
DROP POLICY IF EXISTS ai_insights_select ON ai_insights;
CREATE POLICY ai_insights_select ON ai_insights FOR SELECT
  USING (fn_can_see(parent_type, parent_id));

DROP POLICY IF EXISTS ai_insights_insert ON ai_insights;
CREATE POLICY ai_insights_insert ON ai_insights FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm') OR fn_is_admin());

DROP POLICY IF EXISTS ai_insights_update ON ai_insights;
CREATE POLICY ai_insights_update ON ai_insights FOR UPDATE
  USING (fn_my_role() IN ('admin','pm'));

-- ============================================================
-- RATINGS POLICIES
-- Directional rule for writes: enforced by fn_check_rating_direction trigger (0007).
-- Reads: developers see only ratings about themselves.
--        PM/admin see all reports' ratings.
-- ============================================================
DROP POLICY IF EXISTS ratings_select ON ratings;
CREATE POLICY ratings_select ON ratings FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm','finance')
    OR (fn_my_role() = 'developer' AND ratee_user_id = fn_me())
    OR rater_user_id = fn_me()
  );

DROP POLICY IF EXISTS ratings_insert ON ratings;
CREATE POLICY ratings_insert ON ratings FOR INSERT
  WITH CHECK (
    fn_my_role() IN ('admin','pm')
    OR rater_user_id = fn_me()
  );

DROP POLICY IF EXISTS ratings_update ON ratings;
CREATE POLICY ratings_update ON ratings FOR UPDATE
  USING (
    fn_is_admin()
    OR rater_user_id = fn_me()
  );

-- ============================================================
-- TESTS POLICIES (polymorphic — delegate to parent)
-- ============================================================
DROP POLICY IF EXISTS tests_select ON tests;
CREATE POLICY tests_select ON tests FOR SELECT
  USING (fn_can_see(parent_type, parent_id));

DROP POLICY IF EXISTS tests_insert ON tests;
CREATE POLICY tests_insert ON tests FOR INSERT
  WITH CHECK (fn_can_edit(parent_type, parent_id));

DROP POLICY IF EXISTS tests_update ON tests;
CREATE POLICY tests_update ON tests FOR UPDATE
  USING (fn_can_edit(parent_type, parent_id) OR tester_user_id = fn_me());

-- ============================================================
-- TIME_LOGS POLICIES
-- HARD RULES:
--   developers: SELECT only WHERE user_id = fn_me() (own rows only)
--   PMs: NO direct SELECT (they use rollup views for aggregate hours)
--   admin/finance: SELECT all
--   developers + own: INSERT/UPDATE
-- ============================================================
DROP POLICY IF EXISTS time_logs_select ON time_logs;
CREATE POLICY time_logs_select ON time_logs FOR SELECT
  USING (
    fn_my_role() IN ('admin','finance')
    OR (fn_my_role() = 'developer' AND user_id = fn_me())
    -- PM: no SELECT policy on this table; use v_milestone_rollup/v_project_rollup
  );

DROP POLICY IF EXISTS time_logs_insert ON time_logs;
CREATE POLICY time_logs_insert ON time_logs FOR INSERT
  WITH CHECK (
    fn_my_role() IN ('admin','pm')
    OR (fn_my_role() = 'developer' AND user_id = fn_me())
  );

DROP POLICY IF EXISTS time_logs_update ON time_logs;
CREATE POLICY time_logs_update ON time_logs FOR UPDATE
  USING (
    fn_is_admin()
    OR (fn_my_role() = 'developer' AND user_id = fn_me())
  );

-- ============================================================
-- APPS POLICIES (the catalog — broadly readable)
-- ============================================================
DROP POLICY IF EXISTS apps_select ON apps;
CREATE POLICY apps_select ON apps FOR SELECT
  USING (fn_my_role() IN ('admin','pm','developer','finance','sales'));

DROP POLICY IF EXISTS apps_insert ON apps;
CREATE POLICY apps_insert ON apps FOR INSERT
  WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS apps_update ON apps;
CREATE POLICY apps_update ON apps FOR UPDATE
  USING (fn_is_admin());

-- ============================================================
-- APP_LINKS POLICIES (polymorphic)
-- ============================================================
DROP POLICY IF EXISTS app_links_select ON app_links;
CREATE POLICY app_links_select ON app_links FOR SELECT
  USING (fn_can_see(parent_type, parent_id));

DROP POLICY IF EXISTS app_links_insert ON app_links;
CREATE POLICY app_links_insert ON app_links FOR INSERT
  WITH CHECK (fn_can_edit(parent_type, parent_id) OR parent_id = fn_me());

DROP POLICY IF EXISTS app_links_update ON app_links;
CREATE POLICY app_links_update ON app_links FOR UPDATE
  USING (fn_can_edit(parent_type, parent_id) OR parent_id = fn_me());

-- ============================================================
-- OWNERSHIP JOIN TABLE POLICIES
-- ============================================================

-- contact_owners
DROP POLICY IF EXISTS contact_owners_select ON contact_owners;
CREATE POLICY contact_owners_select ON contact_owners FOR SELECT
  USING (fn_my_role() IN ('admin','pm','sales','finance'));

DROP POLICY IF EXISTS contact_owners_insert ON contact_owners;
CREATE POLICY contact_owners_insert ON contact_owners FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

-- deal_owners
DROP POLICY IF EXISTS deal_owners_select ON deal_owners;
CREATE POLICY deal_owners_select ON deal_owners FOR SELECT
  USING (fn_my_role() IN ('admin','pm','sales','finance'));

DROP POLICY IF EXISTS deal_owners_insert ON deal_owners;
CREATE POLICY deal_owners_insert ON deal_owners FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

-- project_members
DROP POLICY IF EXISTS project_members_select ON project_members;
CREATE POLICY project_members_select ON project_members FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm','finance','sales')
    OR (fn_my_role() = 'developer' AND user_id = fn_me())
  );

DROP POLICY IF EXISTS project_members_insert ON project_members;
CREATE POLICY project_members_insert ON project_members FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

DROP POLICY IF EXISTS project_members_delete ON project_members;
CREATE POLICY project_members_delete ON project_members FOR DELETE
  USING (fn_my_role() IN ('admin','pm'));

-- milestone_members
DROP POLICY IF EXISTS milestone_members_select ON milestone_members;
CREATE POLICY milestone_members_select ON milestone_members FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm','finance','sales')
    OR (fn_my_role() = 'developer' AND user_id = fn_me())
  );

DROP POLICY IF EXISTS milestone_members_insert ON milestone_members;
CREATE POLICY milestone_members_insert ON milestone_members FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

DROP POLICY IF EXISTS milestone_members_delete ON milestone_members;
CREATE POLICY milestone_members_delete ON milestone_members FOR DELETE
  USING (fn_my_role() IN ('admin','pm'));

-- task_managers
DROP POLICY IF EXISTS task_managers_select ON task_managers;
CREATE POLICY task_managers_select ON task_managers FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm','finance')
    OR user_id = fn_me()
  );

DROP POLICY IF EXISTS task_managers_insert ON task_managers;
CREATE POLICY task_managers_insert ON task_managers FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

DROP POLICY IF EXISTS task_managers_delete ON task_managers;
CREATE POLICY task_managers_delete ON task_managers FOR DELETE
  USING (fn_my_role() IN ('admin','pm'));

-- task_assignees
DROP POLICY IF EXISTS task_assignees_select ON task_assignees;
CREATE POLICY task_assignees_select ON task_assignees FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm','finance')
    OR user_id = fn_me()
  );

DROP POLICY IF EXISTS task_assignees_insert ON task_assignees;
CREATE POLICY task_assignees_insert ON task_assignees FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm'));

DROP POLICY IF EXISTS task_assignees_delete ON task_assignees;
CREATE POLICY task_assignees_delete ON task_assignees FOR DELETE
  USING (fn_my_role() IN ('admin','pm'));

-- contact_lead_sources
DROP POLICY IF EXISTS contact_lead_sources_select ON contact_lead_sources;
CREATE POLICY contact_lead_sources_select ON contact_lead_sources FOR SELECT
  USING (fn_my_role() IN ('admin','pm','sales','finance'));

DROP POLICY IF EXISTS contact_lead_sources_insert ON contact_lead_sources;
CREATE POLICY contact_lead_sources_insert ON contact_lead_sources FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm','sales'));

-- deal_tags
DROP POLICY IF EXISTS deal_tags_select ON deal_tags;
CREATE POLICY deal_tags_select ON deal_tags FOR SELECT
  USING (fn_my_role() IN ('admin','pm','sales','finance'));

DROP POLICY IF EXISTS deal_tags_insert ON deal_tags;
CREATE POLICY deal_tags_insert ON deal_tags FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm','sales'));

-- ============================================================
-- AI_ACTIONS POLICIES
-- Read: admin/pm (to confirm/reject proposals)
-- Write: service role (AI agents write proposals)
-- ============================================================
DROP POLICY IF EXISTS ai_actions_select ON ai_actions;
CREATE POLICY ai_actions_select ON ai_actions FOR SELECT
  USING (fn_my_role() IN ('admin','pm'));

DROP POLICY IF EXISTS ai_actions_insert ON ai_actions;
CREATE POLICY ai_actions_insert ON ai_actions FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm') OR fn_me() IS NULL);
  -- fn_me() IS NULL covers service-role / background jobs with no user context

DROP POLICY IF EXISTS ai_actions_update ON ai_actions;
CREATE POLICY ai_actions_update ON ai_actions FOR UPDATE
  USING (fn_my_role() IN ('admin','pm'));

-- ============================================================
-- SOP_DOCUMENTS POLICIES
-- All internal roles read; admin writes.
-- ============================================================
DROP POLICY IF EXISTS sop_select ON sop_documents;
CREATE POLICY sop_select ON sop_documents FOR SELECT
  USING (fn_my_role() IN ('admin','pm','developer','finance','sales'));

DROP POLICY IF EXISTS sop_insert ON sop_documents;
CREATE POLICY sop_insert ON sop_documents FOR INSERT
  WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS sop_update ON sop_documents;
CREATE POLICY sop_update ON sop_documents FOR UPDATE
  USING (fn_is_admin());

-- ============================================================
-- PROJECT_TIMELINE_EVENTS POLICIES
-- Internal: admin/pm/finance/sales/developers (project members)
-- Client portal: clients see timeline for their own projects (read-only).
-- Note: v_timeline_client strips source_evidence; this policy controls rows.
-- ============================================================
DROP POLICY IF EXISTS pte_select ON project_timeline_events;
CREATE POLICY pte_select ON project_timeline_events FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm','finance','sales')
    OR (fn_my_role() = 'developer' AND fn_is_member_of_project(project_id))
    OR fn_is_client_for_project(project_id)
  );

DROP POLICY IF EXISTS pte_insert ON project_timeline_events;
CREATE POLICY pte_insert ON project_timeline_events FOR INSERT
  WITH CHECK (fn_my_role() IN ('admin','pm') OR fn_me() IS NULL);

-- ============================================================
-- DIGESTS POLICIES
-- Users read their own digests; PM reads PM digests; admin reads all.
-- ============================================================
DROP POLICY IF EXISTS digests_select ON digests;
CREATE POLICY digests_select ON digests FOR SELECT
  USING (
    fn_is_admin()
    OR (subject_type = 'user'       AND subject_id = fn_me())
    OR (subject_type = 'pm'         AND fn_my_role() = 'pm' AND subject_id = fn_me())
    OR (subject_type = 'management' AND fn_my_role() IN ('admin','pm'))
  );

DROP POLICY IF EXISTS digests_insert ON digests;
CREATE POLICY digests_insert ON digests FOR INSERT
  WITH CHECK (fn_is_admin() OR fn_me() IS NULL);

-- ============================================================
-- EMBEDDINGS POLICIES
-- Service role writes; admin/pm read; developers read own project scope.
-- ============================================================
DROP POLICY IF EXISTS embeddings_select ON embeddings;
CREATE POLICY embeddings_select ON embeddings FOR SELECT
  USING (
    fn_my_role() IN ('admin','pm','finance')
    OR (fn_my_role() = 'developer' AND fn_can_see(parent_type, parent_id))
  );

DROP POLICY IF EXISTS embeddings_insert ON embeddings;
CREATE POLICY embeddings_insert ON embeddings FOR INSERT
  WITH CHECK (fn_is_admin() OR fn_me() IS NULL);

-- ============================================================
-- COLUMN-LEVEL SECURITY: revoke credentials.secret_ref from ALL app roles
-- (was revoked from PUBLIC in 0005; revoke from each named role here too)
-- Only the service role (reveal_credential server action) may read plaintext.
-- ============================================================
-- ============================================================
-- PREVENT ROLE/STATUS SELF-PROMOTION
-- WITH CHECK in RLS UPDATE policies can't compare OLD vs NEW, so this trigger
-- enforces that non-admins cannot change their own role or status.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_prevent_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor uuid;
  v_actor_role user_role;
BEGIN
  v_actor := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  IF v_actor IS NULL THEN
    -- System/service-role context: allow
    RETURN NEW;
  END IF;

  SELECT role INTO v_actor_role FROM users WHERE id = v_actor AND archived_at IS NULL;

  -- Only admin can change role or status of any user
  IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status)
     AND v_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'Only admin may change user role or status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON users;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE OF role, status ON users
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_role_escalation();

-- ============================================================
-- COLUMN-LEVEL SECURITY: revoke credentials.secret_ref from ALL app roles
-- ============================================================
DO $$ BEGIN
  REVOKE SELECT (secret_ref) ON credentials FROM role_admin;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE SELECT (secret_ref) ON credentials FROM role_pm;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE SELECT (secret_ref) ON credentials FROM role_developer;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE SELECT (secret_ref) ON credentials FROM role_sales;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE SELECT (secret_ref) ON credentials FROM role_finance;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE SELECT (secret_ref) ON credentials FROM role_client;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE SELECT (secret_ref) ON credentials FROM role_viewer;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

COMMIT;
