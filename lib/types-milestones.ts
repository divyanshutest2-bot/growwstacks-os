// lib/types-milestones.ts — view-model shapes the Milestones UI reads.
//
// 🚨 PARTIAL DEVELOPER PROJECTION: the Milestones slice reads TWO DIFFERENT VIEWS
// depending on role (lib/actions/milestones.ts → getCurrentUserRole):
//   - non-developer (admin/pm/finance/sales) → v_milestone_rollup (FULL shape,
//     includes contact_id / company_id + price / currency + rollup columns).
//   - developer → v_milestone_dev (PARTIAL shape: contact_id / company_id and
//     ALL money columns — price / currency — are PHYSICALLY ABSENT from the view,
//     migrations/0009).
//
// So `MilestoneRollup` (full) is a SUPERSET of `MilestoneDev` (developer-safe).
// The detail page branches on the data shape: if `is_dev` is set we render the
// dev projection (delivery only, no billing card, no client identity). These are
// convenience types, intentionally loose on nullability; the DB is the truth.
//
// Kept in a milestones-specific file to avoid colliding with shared lib/types.ts
// (other entity agents work in parallel).

// ---------------------------------------------------------------------------
// v_milestone_dev — the columns a DEVELOPER is allowed to see. This is the
// projection's contract: contact_id / company_id / price / currency are NOT
// here, by design. (migrations/0009 v_milestone_dev.)
// ---------------------------------------------------------------------------
export type MilestoneDev = {
  id: string;
  display_id: string;
  name: string;
  project_id: string;
  status: string;
  milestone_manager_id: string | null;
  start_date: string | null;
  target_date: string | null;
  actual_completion_date: string | null;
  estimated_hours: string | number | null;
  created_at: string;
  updated_at: string;
  // computed (read-only, never stored):
  completion_pct: string | number | null;
  schedule_state: string | null;
};

// ---------------------------------------------------------------------------
// v_milestone_rollup — the FULL shape (non-developer roles). Superset of dev:
// adds the client spine + money + the rollup counts. (migrations/0008.)
// ---------------------------------------------------------------------------
export type MilestoneRollup = MilestoneDev & {
  contact_id: string | null;
  company_id: string | null;
  price: string | number | null;
  currency: string | null;
  archived_at: string | null;
  // rollup-computed (v_milestone_rollup):
  total_tasks: number | null;
  done_tasks: number | null;
  time_spent_minutes: string | number | null;
  test_count: number | null;
  test_pass_count: number | null;
};

// A row in either projection. The list/table renders only the columns present
// in BOTH shapes (name, display_id, status, completion_pct, schedule_state), so
// it is safe over a developer's partial rows.
export type MilestoneListRow = MilestoneDev & Partial<MilestoneRollup>;

// ---------------------------------------------------------------------------
// v_milestone_billing — non-developer only (no developer SELECT path; the action
// never even fetches this for a developer).
// ---------------------------------------------------------------------------
export type MilestoneBilling = {
  agreed: string | number | null;
  currency: string | null;
  received: string | number | null;
  outstanding: string | number | null;
  pct_collected: string | number | null;
};

// ---------------------------------------------------------------------------
// v_milestone_progress — read-only completion (done/total tasks). Visible to
// BOTH projections (delivery info, not money/client).
// ---------------------------------------------------------------------------
export type MilestoneProgress = {
  completion_pct: string | number | null;
  total_tasks: number | null;
  done_tasks: number | null;
};

export type MilestoneMember = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string; // 'pm' | 'developer'
  created_at: string;
};

export type MilestoneContact = {
  id: string;
  full_name: string;
};

export type MilestoneProject = {
  id: string;
  name: string;
  display_id: string;
};

// The discriminated payload getMilestone returns. `is_dev=true` means the partial
// (developer) projection — billing/contact are null and must not render.
export type MilestoneDetail =
  | {
      is_dev: false;
      milestone: MilestoneRollup;
      billing: MilestoneBilling | null;
      progress: MilestoneProgress | null;
      members: MilestoneMember[];
      contact: MilestoneContact | null;
      project: MilestoneProject | null;
    }
  | {
      is_dev: true;
      milestone: MilestoneDev;
      billing: null;
      progress: MilestoneProgress | null;
      members: MilestoneMember[];
      contact: null;
      project: MilestoneProject | null;
    };
