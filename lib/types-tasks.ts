// lib/types-tasks.ts — view-model shapes the Tasks UI reads.
//
// 🚨 PARTIAL DEVELOPER PROJECTION: the Tasks slice reads TWO DIFFERENT VIEWS
// depending on role (lib/actions/tasks.ts → getCurrentUserRole):
//   - non-developer (admin/pm/finance/sales) → v_task_rollup (FULL shape,
//     includes contact_id / company_id — the CLIENT identity columns).
//   - developer → v_task_dev (PARTIAL shape: contact_id / company_id are
//     PHYSICALLY ABSENT from the view; tasks have NO money columns at all).
//
// So `TaskRollup` (full) is a SUPERSET of `TaskDev` (developer-safe). The detail
// page branches on the data shape: if `is_dev` is set we render the dev
// projection (delivery only, no client identity). These are convenience types,
// intentionally loose on nullability; the DB is the truth.
//
// Kept in a tasks-specific file to avoid colliding with shared lib/types.ts
// (other entity agents work in parallel).

// ---------------------------------------------------------------------------
// v_task_dev — the columns a DEVELOPER is allowed to see. This is the
// projection's contract: contact_id / company_id are NOT here, by design.
// (migrations/0009 v_task_dev.)
// ---------------------------------------------------------------------------
export type TaskDev = {
  id: string;
  display_id: string;
  title: string;
  parent_type: string; // milestone | deal | payment
  parent_id: string;
  project_id: string | null;
  milestone_id: string | null;
  status: string;
  delivery_state: string;
  priority: string | null;
  primary_pm_id: string | null;
  start_date: string | null;
  plan_due_date: string | null;
  execution_start_date: string | null;
  execution_end_date: string | null;
  time_reported_hours: string | number | null;
  requirement: string | null;
  details: string | null;
  ai_created: boolean;
  created_at: string;
  updated_at: string;
  // computed (read-only, never stored):
  schedule_state: string | null;
};

// ---------------------------------------------------------------------------
// v_task_rollup — the FULL shape (non-developer roles). Superset of dev: adds
// the client spine (contact_id / company_id) + the rollup computeds.
// (migrations/0008.)
// ---------------------------------------------------------------------------
export type TaskRollup = TaskDev & {
  contact_id: string | null;
  company_id: string | null;
  archived_at: string | null;
  // rollup-computed (v_task_rollup):
  time_spent_minutes: string | number | null;
  test_count: number | null;
  test_pass_count: number | null;
  avg_rating: string | number | null;
};

// A row in either projection. The list/table renders only the columns present
// in BOTH shapes (title, display_id, status, priority, delivery_state,
// schedule_state), so it is safe over a developer's partial rows.
export type TaskListRow = TaskDev & Partial<TaskRollup>;

export type TaskAssignee = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

export type TaskManager = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

export type TaskContact = {
  id: string;
  full_name: string;
};

export type TaskMilestone = {
  id: string;
  name: string;
  display_id: string;
};

// A dev/UAT test row attached to a task (tests table, parent_type='task').
// Delivery-safe: no client identity. outcome is null until conducted.
export type TaskTestRow = {
  id: string;
  test_type: string; // 'developer' | 'uat'
  title: string | null;
  brief: string | null;
  outcome: string | null; // 'pass' | 'fail' | null (pending)
  tester_user_id: string | null;
  tester_name: string | null;
  conducted_at: string | null;
  passed_at: string | null;
};

// A single time-log row the CALLER can see (time_logs RLS: a developer sees ONLY
// their own rows). minutes is rendered as hours in the UI. Delivery-safe.
export type TaskTimeLogRow = {
  id: string;
  user_id: string;
  user_name: string | null;
  minutes: number;
  logged_for_date: string;
  note: string | null;
};

// The discriminated payload getTask returns. `is_dev=true` means the partial
// (developer) projection — contact is null and must not render as client identity.
export type TaskDetail =
  | {
      is_dev: false;
      task: TaskRollup;
      assignees: TaskAssignee[];
      managers: TaskManager[];
      contact: TaskContact | null;
      milestone: TaskMilestone | null;
    }
  | {
      is_dev: true;
      task: TaskDev;
      assignees: TaskAssignee[];
      managers: TaskManager[];
      contact: null;
      milestone: TaskMilestone | null;
    };
