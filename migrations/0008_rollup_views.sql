-- Migration 0008 | rollup_views | Computed rollup functions and views | Depends: 0007
--
-- ARCHITECTURE RULE: Money, progress, and state are COMPUTED, never stored.
-- Payments and tasks are the only written facts. Everything here is read-time
-- computation. Start as plain SQL views (correct, simple); promote to
-- materialized views only when measured slow (unlikely at this scale).
--
-- Function order matters: fn_is_received must exist before billing views.

BEGIN;

-- ============================================================
-- fn_is_received(status) — defined ONCE; every billing rollup calls it
-- Returns true for statuses that mean money has been received.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_is_received(s payment_status)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT s IN ('received', 'confirmed', 'client_paid', 'in_team_accounts')
$$;

-- ============================================================
-- fn_milestone_pct(milestone_id) — TASK COUNT ONLY
-- done_tasks / total_tasks. Hours never feed completion (ARCHITECTURE §3a).
-- Returns NULL when milestone has no tasks (avoids 0/0 division).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_milestone_pct(p_milestone_id uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT
    CASE WHEN COUNT(*) = 0 THEN NULL
    ELSE ROUND(COUNT(*) FILTER (WHERE status = 'done') * 100.0 / COUNT(*), 1)
    END
  FROM tasks
  WHERE milestone_id = p_milestone_id
    AND parent_type = 'milestone'
    AND archived_at IS NULL
$$;

-- ============================================================
-- fn_project_pct(project_id) — task-count weighted across milestones
-- SUM(done_tasks) / SUM(total_tasks) across all non-archived milestones.
-- Returns NULL when project has no tasks.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_project_pct(p_project_id uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT
    CASE WHEN SUM(total) = 0 OR SUM(total) IS NULL THEN NULL
    ELSE ROUND(SUM(done) * 100.0 / SUM(total), 1)
    END
  FROM (
    SELECT
      COUNT(*)                                      AS total,
      COUNT(*) FILTER (WHERE t.status = 'done')    AS done
    FROM milestones m
    JOIN tasks t
      ON t.milestone_id = m.id
     AND t.parent_type = 'milestone'
     AND t.archived_at IS NULL
    WHERE m.project_id = p_project_id
      AND m.archived_at IS NULL
  ) s
$$;

-- ============================================================
-- fn_schedule_state — human-readable schedule status
-- Returns: 'Delivered', 'Overdue Nd', 'Due in Nd', 'On track'
-- Used by projects, milestones, tasks (same logic, one function).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_schedule_state(
  p_start  date,
  p_target date,
  p_actual date,
  p_pct    numeric,
  p_status text
)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  -- Already delivered / done
  IF p_actual IS NOT NULL OR p_pct = 100 THEN
    RETURN 'Delivered';
  END IF;
  -- Past target date and not complete
  IF p_target IS NOT NULL AND p_target < CURRENT_DATE THEN
    RETURN 'Overdue ' || (CURRENT_DATE - p_target)::text || 'd';
  END IF;
  -- Due within 7 days
  IF p_target IS NOT NULL AND (p_target - CURRENT_DATE) <= 7 THEN
    RETURN 'Due in ' || (p_target - CURRENT_DATE)::text || 'd';
  END IF;
  RETURN 'On track';
END;
$$;

-- ============================================================
-- BILLING ROLLUP VIEWS
-- ============================================================

-- v_milestone_billing
CREATE OR REPLACE VIEW v_milestone_billing AS
SELECT
  m.id                                                                          AS milestone_id,
  m.price                                                                       AS agreed,
  m.currency,
  COALESCE(SUM(p.amount) FILTER (WHERE fn_is_received(p.status)), 0)           AS received,
  COALESCE(m.price - SUM(p.amount) FILTER (WHERE fn_is_received(p.status)),
           m.price)                                                             AS outstanding,
  CASE WHEN m.price > 0
    THEN ROUND(
      COALESCE(SUM(p.amount) FILTER (WHERE fn_is_received(p.status)), 0)
      * 100.0 / m.price, 1)
    ELSE NULL
  END                                                                           AS pct_collected
FROM milestones m
LEFT JOIN payments p
  ON p.milestone_id = m.id
 AND p.archived_at IS NULL
WHERE m.archived_at IS NULL
GROUP BY m.id, m.price, m.currency;

-- v_deal_billing
CREATE OR REPLACE VIEW v_deal_billing AS
SELECT
  d.id                                                                          AS deal_id,
  d.deal_value                                                                  AS agreed,
  d.currency,
  COALESCE(SUM(p.amount) FILTER (WHERE fn_is_received(p.status)), 0)           AS received,
  COALESCE(d.deal_value - SUM(p.amount) FILTER (WHERE fn_is_received(p.status)),
           d.deal_value)                                                        AS outstanding,
  CASE WHEN d.deal_value > 0
    THEN ROUND(
      COALESCE(SUM(p.amount) FILTER (WHERE fn_is_received(p.status)), 0)
      * 100.0 / d.deal_value, 1)
    ELSE NULL
  END                                                                           AS pct_collected
FROM deals d
LEFT JOIN payments p
  ON p.deal_id = d.id
 AND p.archived_at IS NULL
WHERE d.archived_at IS NULL
GROUP BY d.id, d.deal_value, d.currency;

-- v_project_billing
-- Project's agreed value = linked deal's deal_value.
-- Received = payments where project_id = P OR milestone belongs to this project.
-- Attribution rule: a payment counts toward its deal always; toward project if
-- project_id set OR its milestone belongs to the project.
CREATE OR REPLACE VIEW v_project_billing AS
SELECT
  pr.id                                                                         AS project_id,
  d.deal_value                                                                  AS agreed,
  d.currency,
  COALESCE(SUM(p.amount) FILTER (WHERE fn_is_received(p.status)), 0)           AS received,
  COALESCE(d.deal_value - SUM(p.amount) FILTER (WHERE fn_is_received(p.status)),
           d.deal_value)                                                        AS outstanding,
  CASE WHEN d.deal_value > 0
    THEN ROUND(
      COALESCE(SUM(p.amount) FILTER (WHERE fn_is_received(p.status)), 0)
      * 100.0 / d.deal_value, 1)
    ELSE NULL
  END                                                                           AS pct_collected
FROM projects pr
LEFT JOIN deals d
  ON d.id = pr.deal_id
LEFT JOIN payments p
  ON (
    p.project_id = pr.id
    OR p.milestone_id IN (
      SELECT id FROM milestones WHERE project_id = pr.id AND archived_at IS NULL
    )
  )
  AND p.archived_at IS NULL
WHERE pr.archived_at IS NULL
GROUP BY pr.id, d.deal_value, d.currency;

-- ============================================================
-- PROGRESS ROLLUP VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_milestone_progress AS
SELECT
  m.id                          AS milestone_id,
  fn_milestone_pct(m.id)        AS completion_pct,
  (
    SELECT COUNT(*) FROM tasks
    WHERE milestone_id = m.id
      AND parent_type = 'milestone'
      AND archived_at IS NULL
  )                             AS total_tasks,
  (
    SELECT COUNT(*) FROM tasks
    WHERE milestone_id = m.id
      AND parent_type = 'milestone'
      AND status = 'done'
      AND archived_at IS NULL
  )                             AS done_tasks
FROM milestones m
WHERE m.archived_at IS NULL;

CREATE OR REPLACE VIEW v_project_progress AS
SELECT
  p.id                    AS project_id,
  fn_project_pct(p.id)    AS completion_pct
FROM projects p
WHERE p.archived_at IS NULL;

-- ============================================================
-- ENTITY ROLLUP VIEWS
-- These join each entity with its key derived stats.
-- They do NOT store computed values — everything is computed at read time.
-- ============================================================

-- v_task_rollup
CREATE OR REPLACE VIEW v_task_rollup AS
SELECT
  t.*,
  fn_schedule_state(
    t.start_date, t.plan_due_date, t.execution_end_date, NULL, t.status::text
  )                                                                             AS schedule_state,
  (
    SELECT COALESCE(SUM(tl.minutes), 0)
    FROM time_logs tl
    WHERE tl.task_id = t.id AND tl.archived_at IS NULL
  )                                                                             AS time_spent_minutes,
  (
    SELECT COUNT(*) FROM tests
    WHERE parent_type = 'task' AND parent_id = t.id AND archived_at IS NULL
  )                                                                             AS test_count,
  (
    SELECT COUNT(*) FROM tests
    WHERE parent_type = 'task' AND parent_id = t.id
      AND outcome = 'pass' AND archived_at IS NULL
  )                                                                             AS test_pass_count,
  (
    SELECT ROUND(AVG(stars), 1) FROM ratings
    WHERE parent_type = 'task' AND parent_id = t.id AND archived_at IS NULL
  )                                                                             AS avg_rating
FROM tasks t
WHERE t.archived_at IS NULL;

-- v_milestone_rollup
CREATE OR REPLACE VIEW v_milestone_rollup AS
SELECT
  m.*,
  fn_milestone_pct(m.id)                                                        AS completion_pct,
  fn_schedule_state(
    m.start_date, m.target_date, m.actual_completion_date,
    fn_milestone_pct(m.id), m.status::text
  )                                                                              AS schedule_state,
  (
    SELECT COUNT(*) FROM tasks
    WHERE milestone_id = m.id AND parent_type = 'milestone' AND archived_at IS NULL
  )                                                                              AS total_tasks,
  (
    SELECT COUNT(*) FROM tasks
    WHERE milestone_id = m.id AND parent_type = 'milestone'
      AND status = 'done' AND archived_at IS NULL
  )                                                                              AS done_tasks,
  (
    SELECT COALESCE(SUM(tl.minutes), 0)
    FROM time_logs tl
    WHERE tl.milestone_id = m.id AND tl.archived_at IS NULL
  )                                                                              AS time_spent_minutes,
  (
    SELECT COUNT(*) FROM tests
    WHERE parent_type = 'milestone' AND parent_id = m.id AND archived_at IS NULL
  )                                                                              AS test_count,
  (
    SELECT COUNT(*) FROM tests
    WHERE parent_type = 'milestone' AND parent_id = m.id
      AND outcome = 'pass' AND archived_at IS NULL
  )                                                                              AS test_pass_count
FROM milestones m
WHERE m.archived_at IS NULL;

-- v_project_rollup
CREATE OR REPLACE VIEW v_project_rollup AS
SELECT
  p.*,
  fn_project_pct(p.id)                                                          AS completion_pct,
  fn_schedule_state(
    p.start_date, p.estimated_completion_date, p.actual_completion_date,
    fn_project_pct(p.id), p.status::text
  )                                                                              AS schedule_state,
  (
    SELECT COUNT(*) FROM milestones
    WHERE project_id = p.id AND archived_at IS NULL
  )                                                                              AS milestone_count,
  (
    SELECT COUNT(*) FROM milestones
    WHERE project_id = p.id AND status = 'done' AND archived_at IS NULL
  )                                                                              AS milestones_done,
  (
    SELECT COALESCE(SUM(tl.minutes), 0)
    FROM time_logs tl
    WHERE tl.project_id = p.id AND tl.archived_at IS NULL
  )                                                                              AS time_spent_minutes,
  (
    SELECT COUNT(*) FROM tasks t
    WHERE t.project_id = p.id AND t.archived_at IS NULL
  )                                                                              AS total_tasks,
  (
    SELECT COUNT(*) FROM tasks t
    WHERE t.project_id = p.id AND t.status = 'done' AND t.archived_at IS NULL
  )                                                                              AS done_tasks,
  (
    SELECT COUNT(*) FROM ai_insights
    WHERE parent_type = 'project' AND parent_id = p.id
      AND kind = 'blocker' AND is_active = true AND archived_at IS NULL
  )                                                                              AS active_blocker_count
FROM projects p
WHERE p.archived_at IS NULL;

-- v_deal_rollup
CREATE OR REPLACE VIEW v_deal_rollup AS
SELECT
  d.*,
  db.received,
  db.outstanding,
  db.pct_collected,
  (
    SELECT COUNT(*) FROM projects WHERE deal_id = d.id AND archived_at IS NULL
  )                                                                              AS project_count,
  (
    SELECT COUNT(*) FROM tasks
    WHERE parent_type = 'deal' AND parent_id = d.id AND archived_at IS NULL
  )                                                                              AS task_count,
  (
    SELECT ROUND(AVG(stars), 1) FROM ratings
    WHERE parent_type = 'deal' AND parent_id = d.id AND archived_at IS NULL
  )                                                                              AS avg_rating
FROM deals d
LEFT JOIN v_deal_billing db ON db.deal_id = d.id
WHERE d.archived_at IS NULL;

-- v_contact_rollup
CREATE OR REPLACE VIEW v_contact_rollup AS
SELECT
  c.*,
  (
    SELECT COALESCE(SUM(p.amount) FILTER (WHERE fn_is_received(p.status)), 0)
    FROM payments p
    WHERE p.contact_id = c.id AND p.archived_at IS NULL
  )                                                                              AS lifetime_value_received,
  (
    SELECT COUNT(*) FROM deals
    WHERE contact_id = c.id AND archived_at IS NULL
  )                                                                              AS total_deals,
  (
    SELECT COUNT(*) FROM deals
    WHERE contact_id = c.id AND stage NOT IN ('closed_won','closed_lost','lost_after_handover','lost_no_response','lost_not_fit') AND archived_at IS NULL
  )                                                                              AS open_deals,
  (
    SELECT COUNT(*) FROM projects
    WHERE contact_id = c.id AND archived_at IS NULL
  )                                                                              AS total_projects,
  (
    SELECT COUNT(*) FROM projects
    WHERE contact_id = c.id AND status = 'in_progress' AND archived_at IS NULL
  )                                                                              AS active_projects,
  GREATEST(
    (SELECT MAX(occurred_at) FROM conversation_entries WHERE parent_type = 'contact' AND parent_id = c.id),
    (SELECT MAX(updated_at) FROM tasks WHERE contact_id = c.id AND archived_at IS NULL)
  )                                                                              AS last_activity_at
FROM contacts c
WHERE c.archived_at IS NULL;

-- v_company_rollup
CREATE OR REPLACE VIEW v_company_rollup AS
SELECT
  co.*,
  (
    SELECT COUNT(*) FROM contacts
    WHERE company_id = co.id AND archived_at IS NULL
  )                                                                              AS contact_count,
  (
    SELECT COALESCE(SUM(p.amount) FILTER (WHERE fn_is_received(p.status)), 0)
    FROM payments p
    JOIN contacts ct ON ct.id = p.contact_id
    WHERE ct.company_id = co.id AND p.archived_at IS NULL
  )                                                                              AS lifetime_value_received,
  (
    SELECT COUNT(*) FROM deals d
    JOIN contacts ct ON ct.id = d.contact_id
    WHERE ct.company_id = co.id AND d.archived_at IS NULL
  )                                                                              AS total_deals,
  (
    SELECT COUNT(*) FROM projects pr
    JOIN contacts ct ON ct.id = pr.contact_id
    WHERE ct.company_id = co.id AND pr.archived_at IS NULL
  )                                                                              AS total_projects,
  (
    SELECT COUNT(*) FROM projects pr
    JOIN contacts ct ON ct.id = pr.contact_id
    WHERE ct.company_id = co.id AND pr.status = 'in_progress' AND pr.archived_at IS NULL
  )                                                                              AS active_projects
FROM companies co
WHERE co.archived_at IS NULL;

-- v_user_rollup
CREATE OR REPLACE VIEW v_user_rollup AS
SELECT
  u.*,
  (
    SELECT COUNT(*) FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE ta.user_id = u.id
      AND t.status NOT IN ('done','lost')
      AND t.archived_at IS NULL
  )                                                                              AS active_task_count,
  (
    SELECT COUNT(*) FROM project_members pm
    WHERE pm.user_id = u.id
  )                                                                              AS project_count,
  (
    SELECT ROUND(AVG(r.stars), 1)
    FROM ratings r
    WHERE r.ratee_user_id = u.id AND r.archived_at IS NULL
  )                                                                              AS avg_rating,
  (
    SELECT COALESCE(SUM(tl.minutes), 0)
    FROM time_logs tl
    WHERE tl.user_id = u.id
      AND tl.logged_for_date >= date_trunc('month', CURRENT_DATE)::date
      AND tl.archived_at IS NULL
  )                                                                              AS time_this_month_minutes
FROM users u
WHERE u.archived_at IS NULL;

-- ============================================================
-- DEEP POLYMORPHIC VIEWS
-- These union-chain the spine to give "everything for this contact"
-- in one query. Views do not take parameters; callers add WHERE clauses.
-- Example: WHERE parent_type = 'contact' AND parent_id = $contact_id
-- OR join through the cached contact_id spine column on the child rows.
-- ============================================================

-- v_contact_attachments_deep
-- Returns all attachments attached directly to a contact OR to any of
-- that contact's deals, projects, milestones, or tasks.
-- Callers filter: WHERE parent_type = 'contact' AND parent_id = $id
-- OR (for cross-entity): join on source_entity and parent_id.
CREATE OR REPLACE VIEW v_contact_attachments_deep AS
  SELECT a.*, 'contact'   AS source_entity FROM attachments a
  WHERE a.parent_type = 'contact'    AND a.archived_at IS NULL
UNION ALL
  SELECT a.*, 'deal'      AS source_entity FROM attachments a
  JOIN deals d ON d.id = a.parent_id AND a.parent_type = 'deal' AND d.archived_at IS NULL
  WHERE a.archived_at IS NULL
UNION ALL
  SELECT a.*, 'project'   AS source_entity FROM attachments a
  JOIN projects p ON p.id = a.parent_id AND a.parent_type = 'project' AND p.archived_at IS NULL
  WHERE a.archived_at IS NULL
UNION ALL
  SELECT a.*, 'milestone' AS source_entity FROM attachments a
  JOIN milestones m ON m.id = a.parent_id AND a.parent_type = 'milestone' AND m.archived_at IS NULL
  WHERE a.archived_at IS NULL
UNION ALL
  SELECT a.*, 'task'      AS source_entity FROM attachments a
  JOIN tasks t ON t.id = a.parent_id AND a.parent_type = 'task' AND t.archived_at IS NULL
  WHERE a.archived_at IS NULL;

-- v_contact_notes_deep
CREATE OR REPLACE VIEW v_contact_notes_deep AS
  SELECT n.*, 'contact'   AS source_entity FROM notes n
  WHERE n.parent_type = 'contact'    AND n.archived_at IS NULL
UNION ALL
  SELECT n.*, 'deal'      AS source_entity FROM notes n
  JOIN deals d ON d.id = n.parent_id AND n.parent_type = 'deal' AND d.archived_at IS NULL
  WHERE n.archived_at IS NULL
UNION ALL
  SELECT n.*, 'project'   AS source_entity FROM notes n
  JOIN projects p ON p.id = n.parent_id AND n.parent_type = 'project' AND p.archived_at IS NULL
  WHERE n.archived_at IS NULL
UNION ALL
  SELECT n.*, 'milestone' AS source_entity FROM notes n
  JOIN milestones m ON m.id = n.parent_id AND n.parent_type = 'milestone' AND m.archived_at IS NULL
  WHERE n.archived_at IS NULL
UNION ALL
  SELECT n.*, 'task'      AS source_entity FROM notes n
  JOIN tasks t ON t.id = n.parent_id AND n.parent_type = 'task' AND t.archived_at IS NULL
  WHERE n.archived_at IS NULL;

-- v_contact_conversation_deep
CREATE OR REPLACE VIEW v_contact_conversation_deep AS
  SELECT ce.*, 'contact'   AS source_entity FROM conversation_entries ce
  WHERE ce.parent_type = 'contact'
UNION ALL
  SELECT ce.*, 'deal'      AS source_entity FROM conversation_entries ce
  JOIN deals d ON d.id = ce.parent_id AND ce.parent_type = 'deal' AND d.archived_at IS NULL
UNION ALL
  SELECT ce.*, 'project'   AS source_entity FROM conversation_entries ce
  JOIN projects p ON p.id = ce.parent_id AND ce.parent_type = 'project' AND p.archived_at IS NULL
UNION ALL
  SELECT ce.*, 'milestone' AS source_entity FROM conversation_entries ce
  JOIN milestones m ON m.id = ce.parent_id AND ce.parent_type = 'milestone' AND m.archived_at IS NULL;

COMMIT;
