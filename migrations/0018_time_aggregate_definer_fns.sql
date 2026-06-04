-- Migration 0018 | time_aggregate_definer_fns | Gated SECURITY DEFINER aggregates for the time rollups — restore PM aggregate visibility | Depends: 0017
--
-- WHY (the invoker-aggregate gap, made right):
--   Two design requirements were jointly UNSATISFIABLE through the inline time
--   subqueries the rollup views used:
--     • 0015 made every rollup view `security_invoker = true` so the OUTER row
--       set honors the caller's RLS (the developer-projection wall).
--     • 0005/0010 deny PMs raw `time_logs` rows ON PURPOSE ("PMs access aggregate
--       hours ONLY via rollup views, never raw rows" — 0005:244 / 0010:564).
--   But a security_invoker view runs its INNER `SELECT SUM(minutes) FROM time_logs`
--   as the CALLER too — so for a PM (no time_logs SELECT policy) the aggregate
--   silently returned 0. Empty time_logs hid this; the enriched seed exposed it
--   (PM saw 0h on every milestone/project/user).
--
--   FIX: move the four time aggregates behind a SECURITY DEFINER boundary. The
--   function runs as its owner (neondb_owner, the table owner → RLS-exempt) so it
--   can sum ALL rows, and gates WHO gets a real answer with an explicit internal
--   role check — fn_my_role() IN ('admin','pm','finance') (plus self-access on the
--   user-month variant). Ungated callers (sales, others) still get exactly 0, as
--   today, via COALESCE(...,0). Row-level RLS is untouched: PMs still cannot read
--   a single raw time_logs row; they only receive the gated AGGREGATE.
--
--   Four specific functions (not one generic): the four subqueries filter
--   different columns and the user-month variant has both a date window AND a
--   different gate (self-access), so one function per column keeps each view's
--   swap a single, auditable token and the semantics byte-for-byte clear.
--
--   0008 (original views) and 0015 (security_invoker) stay HISTORICAL — this
--   migration CREATE OR REPLACEs the four affected views in place, swapping ONLY
--   the time column to the gated function, and re-asserts security_invoker on
--   each (CREATE OR REPLACE VIEW preserves reloptions when no WITH is given, but
--   we re-assert unconditionally so the invariant cannot regress).
--
-- Idempotent: CREATE OR REPLACE FUNCTION / VIEW; REVOKE/GRANT and ALTER VIEW are
-- safe to re-run. DB-only — no app code, no policy changes.

BEGIN;

-- ============================================================
-- GATED DEFINER AGGREGATE FUNCTIONS (return bigint to match the
-- existing column type: SUM(int minutes) → bigint, COALESCE 0::bigint).
-- SECURITY DEFINER + STABLE + pinned search_path. The gate reads the
-- CALLER's role/identity via the GUC (fn_my_role/fn_me are unaffected by
-- the definer context — GUCs are session state); the time_logs read runs
-- as the function owner and bypasses RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_time_spent_task(p_task_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN fn_my_role() IN ('admin','pm','finance')
    THEN COALESCE((SELECT sum(tl.minutes) FROM time_logs tl
                   WHERE tl.task_id = p_task_id AND tl.archived_at IS NULL), 0::bigint)
    ELSE 0::bigint
  END
$$;

CREATE OR REPLACE FUNCTION fn_time_spent_milestone(p_milestone_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN fn_my_role() IN ('admin','pm','finance')
    THEN COALESCE((SELECT sum(tl.minutes) FROM time_logs tl
                   WHERE tl.milestone_id = p_milestone_id AND tl.archived_at IS NULL), 0::bigint)
    ELSE 0::bigint
  END
$$;

CREATE OR REPLACE FUNCTION fn_time_spent_project(p_project_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN fn_my_role() IN ('admin','pm','finance')
    THEN COALESCE((SELECT sum(tl.minutes) FROM time_logs tl
                   WHERE tl.project_id = p_project_id AND tl.archived_at IS NULL), 0::bigint)
    ELSE 0::bigint
  END
$$;

-- User-month variant: same gate PLUS self-access (a user always sees their own
-- month total — e.g. a developer reading their own directory row), and the same
-- logged_for_date >= date_trunc('month', CURRENT_DATE) window as the original.
CREATE OR REPLACE FUNCTION fn_time_this_month_user(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN fn_my_role() IN ('admin','pm','finance') OR p_user_id = fn_me()
    THEN COALESCE((SELECT sum(tl.minutes) FROM time_logs tl
                   WHERE tl.user_id = p_user_id
                     AND tl.logged_for_date >= date_trunc('month', CURRENT_DATE)::date
                     AND tl.archived_at IS NULL), 0::bigint)
    ELSE 0::bigint
  END
$$;

-- ============================================================
-- EXECUTE GRANTS — SECURITY DEFINER functions must NOT be world-executable.
-- Revoke from PUBLIC, then grant to the app role (house pattern: app_user is the
-- single non-owner role the app connects as; the security_invoker views call
-- these as app_user).
-- ============================================================
REVOKE EXECUTE ON FUNCTION fn_time_spent_task(uuid)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_time_spent_milestone(uuid)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_time_spent_project(uuid)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_time_this_month_user(uuid)   FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT EXECUTE ON FUNCTION fn_time_spent_task(uuid)      TO app_user;
    GRANT EXECUTE ON FUNCTION fn_time_spent_milestone(uuid) TO app_user;
    GRANT EXECUTE ON FUNCTION fn_time_spent_project(uuid)   TO app_user;
    GRANT EXECUTE ON FUNCTION fn_time_this_month_user(uuid) TO app_user;
  END IF;
END $$;

-- ============================================================
-- CREATE OR REPLACE the four views — ONLY the time column is swapped to the
-- gated function call; every other column is identical to the live definition
-- (reproduced from pg_get_viewdef). Then re-assert security_invoker on each.
-- ============================================================

CREATE OR REPLACE VIEW v_task_rollup AS
 SELECT id,
    display_id,
    title,
    parent_type,
    parent_id,
    project_id,
    milestone_id,
    contact_id,
    company_id,
    status,
    delivery_state,
    priority,
    primary_pm_id,
    start_date,
    plan_due_date,
    execution_start_date,
    execution_end_date,
    time_reported_hours,
    requirement,
    details,
    ai_created,
    ai_action_id,
    created_at,
    updated_at,
    archived_at,
    fn_schedule_state(start_date, plan_due_date, execution_end_date, NULL::numeric, status::text) AS schedule_state,
    fn_time_spent_task(t.id) AS time_spent_minutes,
    ( SELECT count(*) AS count
           FROM tests
          WHERE tests.parent_type = 'task'::entity_type AND tests.parent_id = t.id AND tests.archived_at IS NULL) AS test_count,
    ( SELECT count(*) AS count
           FROM tests
          WHERE tests.parent_type = 'task'::entity_type AND tests.parent_id = t.id AND tests.outcome = 'pass'::test_outcome AND tests.archived_at IS NULL) AS test_pass_count,
    ( SELECT round(avg(ratings.stars), 1) AS round
           FROM ratings
          WHERE ratings.parent_type = 'task'::entity_type AND ratings.parent_id = t.id AND ratings.archived_at IS NULL) AS avg_rating
   FROM tasks t
  WHERE archived_at IS NULL;

CREATE OR REPLACE VIEW v_milestone_rollup AS
 SELECT id,
    display_id,
    name,
    project_id,
    contact_id,
    company_id,
    status,
    milestone_manager_id,
    start_date,
    target_date,
    actual_completion_date,
    estimated_hours,
    price,
    currency,
    created_at,
    updated_at,
    archived_at,
    fn_milestone_pct(id) AS completion_pct,
    fn_schedule_state(start_date, target_date, actual_completion_date, fn_milestone_pct(id), status::text) AS schedule_state,
    ( SELECT count(*) AS count
           FROM tasks
          WHERE tasks.milestone_id = m.id AND tasks.parent_type = 'milestone'::entity_type AND tasks.archived_at IS NULL) AS total_tasks,
    ( SELECT count(*) AS count
           FROM tasks
          WHERE tasks.milestone_id = m.id AND tasks.parent_type = 'milestone'::entity_type AND tasks.status = 'done'::task_status AND tasks.archived_at IS NULL) AS done_tasks,
    fn_time_spent_milestone(m.id) AS time_spent_minutes,
    ( SELECT count(*) AS count
           FROM tests
          WHERE tests.parent_type = 'milestone'::entity_type AND tests.parent_id = m.id AND tests.archived_at IS NULL) AS test_count,
    ( SELECT count(*) AS count
           FROM tests
          WHERE tests.parent_type = 'milestone'::entity_type AND tests.parent_id = m.id AND tests.outcome = 'pass'::test_outcome AND tests.archived_at IS NULL) AS test_pass_count
   FROM milestones m
  WHERE archived_at IS NULL;

CREATE OR REPLACE VIEW v_project_rollup AS
 SELECT id,
    display_id,
    name,
    deal_id,
    contact_id,
    company_id,
    status,
    start_date,
    estimated_completion_date,
    actual_completion_date,
    estimated_hours,
    team_logger_project_name,
    team_logger_project_id,
    project_manager_id,
    requirement,
    overview,
    next_milestone_seq,
    created_at,
    updated_at,
    archived_at,
    fn_project_pct(id) AS completion_pct,
    fn_schedule_state(start_date, estimated_completion_date, actual_completion_date, fn_project_pct(id), status::text) AS schedule_state,
    ( SELECT count(*) AS count
           FROM milestones
          WHERE milestones.project_id = p.id AND milestones.archived_at IS NULL) AS milestone_count,
    ( SELECT count(*) AS count
           FROM milestones
          WHERE milestones.project_id = p.id AND milestones.status = 'done'::milestone_status AND milestones.archived_at IS NULL) AS milestones_done,
    fn_time_spent_project(p.id) AS time_spent_minutes,
    ( SELECT count(*) AS count
           FROM tasks t
          WHERE t.project_id = p.id AND t.archived_at IS NULL) AS total_tasks,
    ( SELECT count(*) AS count
           FROM tasks t
          WHERE t.project_id = p.id AND t.status = 'done'::task_status AND t.archived_at IS NULL) AS done_tasks,
    ( SELECT count(*) AS count
           FROM ai_insights
          WHERE ai_insights.parent_type = 'project'::entity_type AND ai_insights.parent_id = p.id AND ai_insights.kind = 'blocker'::insight_kind AND ai_insights.is_active = true AND ai_insights.archived_at IS NULL) AS active_blocker_count
   FROM projects p
  WHERE archived_at IS NULL;

CREATE OR REPLACE VIEW v_user_rollup AS
 SELECT id,
    email,
    role,
    archived_at,
    display_id,
    full_name,
    phone,
    whatsapp,
    teams_id,
    team_logger_id,
    job_title,
    status,
    shift_start,
    shift_end,
    projects_requested,
    created_at,
    updated_at,
    ( SELECT count(*) AS count
           FROM task_assignees ta
             JOIN tasks t ON t.id = ta.task_id
          WHERE ta.user_id = u.id AND (t.status <> ALL (ARRAY['done'::task_status, 'lost'::task_status])) AND t.archived_at IS NULL) AS active_task_count,
    ( SELECT count(*) AS count
           FROM project_members pm
          WHERE pm.user_id = u.id) AS project_count,
    ( SELECT round(avg(r.stars), 1) AS round
           FROM ratings r
          WHERE r.ratee_user_id = u.id AND r.archived_at IS NULL) AS avg_rating,
    fn_time_this_month_user(u.id) AS time_this_month_minutes
   FROM users u
  WHERE archived_at IS NULL;

-- Re-assert security_invoker on all four (unconditional — the invariant from 0015
-- must hold so the OUTER row set keeps honoring RLS).
ALTER VIEW v_task_rollup      SET (security_invoker = true);
ALTER VIEW v_milestone_rollup SET (security_invoker = true);
ALTER VIEW v_project_rollup   SET (security_invoker = true);
ALTER VIEW v_user_rollup      SET (security_invoker = true);

COMMIT;
