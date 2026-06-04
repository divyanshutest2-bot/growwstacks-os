// lib/types-users.ts — view-model shapes for the Users (team directory) slice.
// Mirrors v_user_rollup (migrations/0008) which is `SELECT u.*, <stats>` over
// the users table (migrations/0005). The DB is the source of truth; these are
// convenience types, intentionally loose on nullability.

export type UserRollup = {
  id: string;
  display_id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  teams_id: string | null;
  team_logger_id: string | null;
  role: string;
  job_title: string | null;
  status: string;
  // `time` columns come back from the neon driver as 'HH:MM:SS' strings.
  shift_start: string | null;
  shift_end: string | null;
  projects_requested: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  // rollup-computed (v_user_rollup):
  active_task_count: number | null;
  project_count: number | null;
  avg_rating: string | number | null;
  time_this_month_minutes: string | number | null;
};

// One row per (user, date) from user_availability. The neon driver returns
// `date` as a Date object and `available_hours` as a numeric string — the UI
// coerces both (never renders a raw Date child).
export type UserAvailabilityRow = {
  date: string | Date;
  available_hours: string | number;
};

// A project the user is a member of (from project_members + projects), with
// their per-project membership role and a count of their open tasks on it.
export type UserWorkloadProjectRow = {
  id: string;
  display_id: string;
  name: string;
  status: string;
  member_role: string;
  task_count: number | string | null;
};

// An open task assigned to the user (task_assignees + tasks). plan_due_date is
// a `date` (Date object from neon) — formatted by the UI.
export type UserWorkloadTaskRow = {
  id: string;
  display_id: string;
  title: string;
  status: string;
  plan_due_date: string | Date | null;
  project_id: string | null;
  project_name: string | null;
};

// A tech-expertise entry (app_links proficiency, parent_type='user').
export type UserExpertiseRow = {
  id: string;
  proficiency: 'expert' | 'intermediate' | null;
  app_name: string;
  category: string | null;
};
