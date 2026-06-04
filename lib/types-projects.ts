// lib/types-projects.ts — view-model shapes the Projects UI reads.
//
// 🚨 PARTIAL DEVELOPER PROJECTION: the Projects slice reads TWO DIFFERENT VIEWS
// depending on role (lib/actions/projects.ts → getCurrentUserRole):
//   - non-developer (admin/pm/finance/sales) → v_project_rollup (FULL shape,
//     includes deal_id / contact_id / company_id + billing rollup columns).
//   - developer → v_project_dev (PARTIAL shape: deal_id / contact_id /
//     company_id and ALL money columns are PHYSICALLY ABSENT from the view).
//
// So `ProjectRollup` (full) is a SUPERSET of `ProjectDev` (developer-safe). The
// detail page branches on the data shape: if `is_dev` is set we render the dev
// projection (delivery only, no billing card, no client identity). These are
// convenience types, intentionally loose on nullability; the DB is the truth.
//
// Kept in a projects-specific file to avoid colliding with shared lib/types.ts
// (other entity agents work in parallel).

// ---------------------------------------------------------------------------
// v_project_dev — the columns a DEVELOPER is allowed to see. This is the
// projection's contract: deal_id / contact_id / company_id / billing are NOT
// here, by design. (migrations/0009 v_project_dev.)
// ---------------------------------------------------------------------------
export type ProjectDev = {
  id: string;
  display_id: string;
  name: string;
  status: string;
  start_date: string | null;
  estimated_completion_date: string | null;
  actual_completion_date: string | null;
  estimated_hours: string | number | null;
  team_logger_project_name: string | null;
  team_logger_project_id: string | null;
  project_manager_id: string | null;
  requirement: string | null;
  overview: string | null;
  next_milestone_seq: number | null;
  created_at: string;
  updated_at: string;
  // computed (read-only, never stored):
  completion_pct: string | number | null;
  schedule_state: string | null;
};

// ---------------------------------------------------------------------------
// v_project_rollup — the FULL shape (non-developer roles). Superset of dev:
// adds the client/deal spine + the rollup counts. (migrations/0008.)
// ---------------------------------------------------------------------------
export type ProjectRollup = ProjectDev & {
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  archived_at: string | null;
  // rollup-computed (v_project_rollup):
  milestone_count: number | null;
  milestones_done: number | null;
  time_spent_minutes: string | number | null;
  total_tasks: number | null;
  done_tasks: number | null;
  active_blocker_count: number | null;
};

// A row in either projection. The list/table renders only the columns present
// in BOTH shapes (name, display_id, status, completion_pct, schedule_state), so
// it is safe over a developer's partial rows.
export type ProjectListRow = ProjectDev & Partial<ProjectRollup>;

// ---------------------------------------------------------------------------
// v_project_billing — non-developer only (no developer SELECT path; the action
// never even fetches this for a developer).
// ---------------------------------------------------------------------------
export type ProjectBilling = {
  agreed: string | number | null;
  currency: string | null;
  received: string | number | null;
  outstanding: string | number | null;
  pct_collected: string | number | null;
};

export type ProjectMember = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string; // 'pm' | 'developer'
  created_at: string;
};

export type ProjectContact = {
  id: string;
  full_name: string;
};

export type ProjectDeal = {
  id: string;
  name: string;
  display_id: string;
};

// ---------------------------------------------------------------------------
// Related-list rows for the cockpit center/right rail. The dev variant omits
// money/client columns (they are physically absent from v_*_dev) — the optional
// fields below are only ever present in the full projection.
// ---------------------------------------------------------------------------
export type ProjectMilestoneRow = {
  id: string;
  display_id: string;
  name: string;
  status: string;
  start_date: string | null;
  target_date: string | null;
  actual_completion_date: string | null;
  completion_pct: string | number | null;
  schedule_state: string | null;
  // full projection only:
  total_tasks?: number | null;
  done_tasks?: number | null;
  price?: string | number | null;
  currency?: string | null;
};

export type ProjectTaskRow = {
  id: string;
  display_id: string;
  title: string;
  status: string;
  priority: string | null;
  delivery_state: string | null;
  start_date: string | null;
  plan_due_date: string | null;
  execution_end_date: string | null;
  schedule_state: string | null;
};

export type ProjectDealSpine = {
  id: string;
  name: string;
  display_id: string;
  deal_value: string | number | null;
  currency: string | null;
  stage: string | null;
};

// The discriminated payload getProject returns. `is_dev=true` means the partial
// (developer) projection — billing/contact/deal are null and must not render.
export type ProjectDetail =
  | {
      is_dev: false;
      project: ProjectRollup;
      billing: ProjectBilling | null;
      members: ProjectMember[];
      contact: ProjectContact | null;
      deal: ProjectDeal | null;
    }
  | {
      is_dev: true;
      project: ProjectDev;
      billing: null;
      members: ProjectMember[];
      contact: null;
      deal: null;
    };
