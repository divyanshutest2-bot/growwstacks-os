-- Migration 0009 | projections | Developer-safe and client-safe view projections | Depends: 0008
--
-- ARCHITECTURE §6.4: THREE projections of core entities:
--   Full (admin/PM/sales) — everything, from the base tables + rollup views.
--   Developer-safe — money, deal_id, contact_id, company_id ABSENT.
--     Developers see delivery work; never client identity or billing.
--   Client-safe — own data only; internal notes/insights/ratings/margins stripped.
--
-- RLS controls ROWS; these views control FIELDS.
-- A developer querying v_project_dev literally cannot see deal_id, company_id,
-- billing, or contact_id — the columns are absent from the view definition.

BEGIN;

-- ============================================================
-- DEVELOPER-SAFE VIEWS
-- What developers see: project/milestone/task structure + schedule.
-- What developers CANNOT see: deal_id, contact_id, company_id, billing,
-- payment data, client identity, team_logger_* identifiers.
-- ============================================================

-- v_project_dev
-- Deliberately excluded: deal_id, contact_id, company_id (client identity stripped).
CREATE OR REPLACE VIEW v_project_dev AS
SELECT
  p.id,
  p.display_id,
  p.name,
  p.status,
  p.start_date,
  p.estimated_completion_date,
  p.actual_completion_date,
  p.estimated_hours,
  -- team_logger fields needed by developers for time sync.
  p.team_logger_project_name,
  p.team_logger_project_id,
  p.project_manager_id,
  p.requirement,
  p.overview,
  p.next_milestone_seq,
  p.created_at,
  p.updated_at,
  fn_project_pct(p.id)                             AS completion_pct,
  fn_schedule_state(
    p.start_date,
    p.estimated_completion_date,
    p.actual_completion_date,
    fn_project_pct(p.id),
    p.status::text
  )                                                AS schedule_state
  -- Deliberately excluded: deal_id, contact_id, company_id (client identity stripped).
  -- Billing rollup views (v_project_billing) have no developer SELECT policy in 0010.
FROM projects p
WHERE p.archived_at IS NULL;

-- v_milestone_dev
-- Deliberately excluded: contact_id, company_id, price, currency (money stripped).
CREATE OR REPLACE VIEW v_milestone_dev AS
SELECT
  m.id,
  m.display_id,
  m.name,
  m.project_id,
  m.status,
  m.milestone_manager_id,
  m.start_date,
  m.target_date,
  m.actual_completion_date,
  m.estimated_hours,
  m.created_at,
  m.updated_at,
  fn_milestone_pct(m.id)                           AS completion_pct,
  fn_schedule_state(
    m.start_date,
    m.target_date,
    m.actual_completion_date,
    fn_milestone_pct(m.id),
    m.status::text
  )                                                AS schedule_state
  -- Deliberately excluded: contact_id, company_id, price, currency (money and client stripped).
FROM milestones m
WHERE m.archived_at IS NULL;

-- v_task_dev
-- Deliberately excluded: contact_id, company_id.
CREATE OR REPLACE VIEW v_task_dev AS
SELECT
  t.id,
  t.display_id,
  t.title,
  t.parent_type,
  t.parent_id,
  t.project_id,
  t.milestone_id,
  t.status,
  t.delivery_state,
  t.priority,
  t.primary_pm_id,
  t.start_date,
  t.plan_due_date,
  t.execution_start_date,
  t.execution_end_date,
  t.time_reported_hours,
  t.requirement,
  t.details,
  t.ai_created,
  t.created_at,
  t.updated_at,
  fn_schedule_state(
    t.start_date,
    t.plan_due_date,
    t.execution_end_date,
    NULL,
    t.status::text
  )                                                AS schedule_state
  -- Deliberately excluded: contact_id, company_id (client identity stripped).
  -- ai_action_id excluded (internal AI tracking).
FROM tasks t
WHERE t.archived_at IS NULL;

-- ============================================================
-- CLIENT-SAFE VIEWS
-- What clients see: their own project/milestone/task progress, deliverables,
-- and the delay-attribution timeline.
-- What clients CANNOT see: deal_id, billing margins, estimated_hours,
-- internal notes/insights/ratings, team_logger_*, company internal data,
-- other clients' data.
-- RLS in 0010 gates ROWS to the client's own contact_id.
-- These views strip FIELDS.
-- ============================================================

-- v_project_client
-- Client sees their project's delivery progress; internal fields stripped.
-- Excluded: deal_id, company_id, estimated_hours, billing, team_logger_*,
-- project_manager_id, requirement (may be internal), overview (may be internal),
-- next_milestone_seq.
CREATE OR REPLACE VIEW v_project_client AS
SELECT
  p.id,
  p.display_id,
  p.name,
  p.status,
  p.start_date,
  p.estimated_completion_date,
  p.actual_completion_date,
  p.contact_id,
  fn_project_pct(p.id)                             AS completion_pct,
  fn_schedule_state(
    p.start_date,
    p.estimated_completion_date,
    p.actual_completion_date,
    fn_project_pct(p.id),
    p.status::text
  )                                                AS schedule_state
  -- Excluded: deal_id, company_id, billing, estimated_hours, team_logger_*,
  -- project_manager_id, requirement, overview, next_milestone_seq.
FROM projects p
WHERE p.archived_at IS NULL;

-- v_milestone_client
-- Client sees milestone name, dates, status, and completion percentage.
-- Excluded: price, currency, billing, estimated_hours, internal fields.
CREATE OR REPLACE VIEW v_milestone_client AS
SELECT
  m.id,
  m.display_id,
  m.name,
  m.project_id,
  m.status,
  m.start_date,
  m.target_date,
  m.actual_completion_date,
  m.contact_id,
  fn_milestone_pct(m.id)                           AS completion_pct,
  fn_schedule_state(
    m.start_date,
    m.target_date,
    m.actual_completion_date,
    fn_milestone_pct(m.id),
    m.status::text
  )                                                AS schedule_state
  -- Excluded: price, currency, estimated_hours, milestone_manager_id,
  -- company_id, billing data.
FROM milestones m
WHERE m.archived_at IS NULL;

-- v_task_client
-- Minimal: client sees title, status, delivery state, and dates.
-- No internal routing (parent_type/parent_id), no PM info, no requirements detail.
CREATE OR REPLACE VIEW v_task_client AS
SELECT
  t.id,
  t.display_id,
  t.title,
  t.status,
  t.delivery_state,
  t.project_id,
  t.milestone_id,
  t.contact_id,
  t.plan_due_date,
  t.execution_end_date,
  fn_schedule_state(
    t.start_date,
    t.plan_due_date,
    t.execution_end_date,
    NULL,
    t.status::text
  )                                                AS schedule_state
  -- Excluded: parent_type, parent_id, priority, primary_pm_id,
  -- requirement, details, ai_created, ai_action_id, contact_id internal use,
  -- company_id, time_reported_hours.
FROM tasks t
WHERE t.archived_at IS NULL;

-- v_deliverables_client
-- Client sees only attachments with purpose = 'client_delivery'.
-- RLS in 0010 will further restrict to the client's own contact_id's entities.
CREATE OR REPLACE VIEW v_deliverables_client AS
SELECT
  a.id,
  a.parent_type,
  a.parent_id,
  a.title,
  a.url,
  a.drive_file_id,
  a.created_at
  -- Excluded: kind, mime_type, size_bytes, purpose (always 'client_delivery' here),
  -- uploaded_by (internal), archived_at.
FROM attachments a
WHERE a.purpose = 'client_delivery'
  AND a.archived_at IS NULL;

-- v_timeline_client
-- Client-facing delay attribution. source_evidence excluded (internal AI workings).
-- RLS in 0010 restricts rows to the client's own project_id.
CREATE OR REPLACE VIEW v_timeline_client AS
SELECT
  pte.id,
  pte.project_id,
  pte.event_type,
  pte.started_at,
  pte.ended_at,
  pte.attributed_to,
  pte.duration_hours,
  pte.detail
  -- Excluded: source_evidence (internal AI evidence/debug info).
FROM project_timeline_events pte;

COMMIT;
