'use server';

// lib/actions/milestones.ts — Milestones data-layer server actions.
//
// 🚨 THE WHOLE POINT OF THIS SLICE — role-branched view selection (mirrors the
// proven Projects pattern). RLS enforces ROWS; the money/client COLUMN stripping
// is enforced by reading the RIGHT view per role. With a single app DB role,
// column grants are unavailable, so this server-side branch IS the field-security
// boundary:
//
//   role === 'developer'  → read v_milestone_dev   (contact_id / company_id /
//                            price / currency are PHYSICALLY ABSENT)
//   otherwise (admin/pm/   → read v_milestone_rollup (full) + v_milestone_billing
//   finance/sales)
//
// A developer NEVER has the rollup or billing returned to them. v_milestone_billing
// is fetched ONLY for non-developer roles. RLS is defence-in-depth underneath: a
// developer who is not a member of the milestone's PROJECT sees zero rows from
// EITHER view (fn_can_see('milestone') delegates to fn_can_see('project')).
//
// Other rules enforced here (CLAUDE.md):
//   - Every DB call goes through asUser(uid, ...) so RLS authorizes it.
//   - NO DELETE on the milestones entity — "delete" = archiveMilestone (sets
//     archived_at). milestone_members IS the documented DELETE exception
//     (membership removal is a legitimate state change).
//   - No stored derived values: completion_pct / schedule_state / billing are
//     READ from the views, never written.
//   - Field-level auto-save: updateMilestoneField PATCHes ONE allowlisted column.
//   - Team is the join table (milestone_members, role pm|developer); authoritative.
//     milestone_manager_id is a cached HEADER pointer only.
//   - contact_id / company_id are CACHED from the project via trigger — NEVER set
//     here. project_id is set at create time only (not editable).
//   - display_id (M#) is trigger-assigned per project — NEVER set here.
//   - Create = admin/pm ONLY (RLS milestones_insert; sales/finance/developer can't).
//   - Edge-safe: only the Neon serverless driver + zod.

import { z } from 'zod';

import { asUser, sqlNoUser } from '@/lib/db';
import { getCurrentUserId, getCurrentUserRole } from '@/lib/auth';

// sqlNoUser is used ONLY as the tagged-template query BUILDER; every query is
// executed via asUser so RLS always applies. (Neon's `sql` is both executor and
// builder; here it is purely the builder.)
const sql = sqlNoUser;

// ---------------------------------------------------------------------------
// Session guard
// ---------------------------------------------------------------------------
async function requireUid(): Promise<string> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

/** True when the caller is a developer → partial projection (v_milestone_dev). */
async function isDeveloper(): Promise<boolean> {
  return (await getCurrentUserRole()) === 'developer';
}

// ---------------------------------------------------------------------------
// Editable-column allowlist (field-level auto-save). Any field NOT in this set
// is rejected before touching the DB. RLS still independently authorizes the row
// (fn_can_edit('milestone') is admin/pm only → developers' UPDATEs are denied).
//   - project_id is set at create time only (not editable; reassigning re-caches
//     the spine — out of scope).
//   - contact_id / company_id are trigger-cached from the project — NEVER editable.
//   - display_id is trigger-assigned (M#) — never set.
//   - milestone_manager_id is a cached HEADER pointer (editable, but not the
//     authoritative team — that is milestone_members).
//   - price / currency are editable money fields (admin/pm only via RLS); they are
//     stored values, distinct from the COMPUTED billing rollup (read-only).
// ---------------------------------------------------------------------------
const EDITABLE_FIELDS = [
  'name',
  'status',
  'milestone_manager_id',
  'start_date',
  'target_date',
  'actual_completion_date',
  'estimated_hours',
  'price',
  'currency',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
const EDITABLE_SET = new Set<string>(EDITABLE_FIELDS);

// Map each editable field to a tagged-template UPDATE. A column NAME cannot be a
// SQL parameter (only values are parameterized), so we keep a static map of full
// statements — every column name is a hard-coded literal, never user-controlled.
// The VALUE is always parameterized (injection-safe).
function buildUpdate(field: EditableField, id: string, value: unknown) {
  switch (field) {
    case 'name':
      return sql`UPDATE milestones SET name = ${value as string}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'status':
      return sql`UPDATE milestones SET status = ${value as string}::milestone_status, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'milestone_manager_id':
      return sql`UPDATE milestones SET milestone_manager_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'start_date':
      return sql`UPDATE milestones SET start_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'target_date':
      return sql`UPDATE milestones SET target_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'actual_completion_date':
      return sql`UPDATE milestones SET actual_completion_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'estimated_hours':
      return sql`UPDATE milestones SET estimated_hours = ${value as number | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'price':
      return sql`UPDATE milestones SET price = ${value as number | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'currency':
      return sql`UPDATE milestones SET currency = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    default: {
      // Exhaustiveness guard: if a new editable field is added without a branch.
      const _never: never = field;
      throw new Error(`Unhandled editable field: ${String(_never)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const uuidSchema = z.string().uuid();

const listFiltersSchema = z
  .object({
    project_id: z.string().uuid().optional(),
    status: z.string().min(1).optional(),
    search: z.string().min(1).max(200).optional(),
  })
  .strict()
  .optional();

export type MilestoneListFilters = z.infer<typeof listFiltersSchema>;

const createMilestoneSchema = z
  .object({
    name: z.string().min(1).max(300),
    project_id: z.string().uuid(), // REQUIRED — every milestone hangs off a project
    status: z.string().min(1).nullish(),
    target_date: z.string().min(1).nullish(),
    estimated_hours: z.number().nullish(),
    price: z.number().nullish(),
    currency: z.string().min(1).max(3).nullish(),
  })
  .strict();

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

// ---------------------------------------------------------------------------
// READS — every read role-branches the view (the column-security boundary).
// ---------------------------------------------------------------------------

/**
 * listMilestones — non-archived milestones.
 *
 * 🚨 ROLE-BRANCH: developer → v_milestone_dev (partial, no money/client columns);
 * everyone else → v_milestone_rollup (full). Both views already filter
 * archived_at IS NULL and RLS restricts ROWS (a developer sees only milestones in
 * projects they are a member of). Filters: project_id, status, search.
 */
export async function listMilestones(filters?: MilestoneListFilters) {
  const uid = await requireUid();
  const dev = await isDeveloper();
  const f = listFiltersSchema.parse(filters) ?? {};

  const projectId = f.project_id ?? null;
  const status = f.status ?? null;
  const search = f.search ? `%${f.search}%` : null;

  // Two static statements (one per view) — never string-built.
  const query = dev
    ? sql`
        SELECT *
        FROM v_milestone_dev
        WHERE (${projectId}::uuid IS NULL OR project_id = ${projectId}::uuid)
          AND (${status}::text IS NULL OR status::text = ${status})
          AND (
            ${search}::text IS NULL
            OR name ILIKE ${search}
            OR display_id ILIKE ${search}
          )
        ORDER BY created_at DESC
        LIMIT 500
      `
    : sql`
        SELECT *
        FROM v_milestone_rollup
        WHERE (${projectId}::uuid IS NULL OR project_id = ${projectId}::uuid)
          AND (${status}::text IS NULL OR status::text = ${status})
          AND (
            ${search}::text IS NULL
            OR name ILIKE ${search}
            OR display_id ILIKE ${search}
          )
        ORDER BY created_at DESC
        LIMIT 500
      `;
  return asUser(uid, query);
}

export type MilestoneMemberRow = {
  milestone_id: string;
  user_id: string;
  full_name: string | null;
  role: string;
};

/**
 * listMembersForMilestones — batch fetch members for a set of milestones so the
 * list can render member chips per row without N+1 reads. RLS-gated: a developer
 * only sees their OWN membership rows (milestone_members_select).
 */
export async function listMembersForMilestones(
  milestoneIds: string[],
): Promise<MilestoneMemberRow[]> {
  const uid = await requireUid();
  if (milestoneIds.length === 0) return [];
  return asUser<MilestoneMemberRow>(
    uid,
    sql`
      SELECT mm.milestone_id, mm.user_id, mm.role, u.full_name
      FROM milestone_members mm
      JOIN users u ON u.id = mm.user_id
      WHERE mm.milestone_id = ANY(${milestoneIds}::uuid[])
      ORDER BY mm.created_at
    `,
  );
}

export type ProjectPickerOption = {
  id: string;
  name: string;
  display_id: string;
};

/**
 * listProjectOptions — project picker for the Create Milestone dialog. A milestone
 * REQUIRES a project. RLS-gated: a developer sees only their member projects, but
 * developers can't create milestones anyway, so the picker is only ever populated
 * for admin/pm. Kept local to this file (do not touch shared directory.ts).
 */
export async function listProjectOptions(): Promise<ProjectPickerOption[]> {
  const uid = await requireUid();
  return asUser<ProjectPickerOption>(
    uid,
    sql`
      SELECT id, name, display_id
      FROM projects
      WHERE archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 500
    `,
  );
}

/**
 * getMilestone — one milestone + members + progress. Returns a DISCRIMINATED
 * payload:
 *
 * 🚨 ROLE-BRANCH:
 *   developer → { is_dev: true } reads v_milestone_dev; billing/contact are NOT
 *     fetched and returned as null (the dev view has no contact_id/price to even
 *     join on). Delivery only. The parent PROJECT name IS resolved (project_id is
 *     in the dev view and a member developer can read the project row — it is
 *     delivery context, not client identity).
 *   non-developer → { is_dev: false } reads v_milestone_rollup +
 *     v_milestone_billing + v_milestone_progress + resolves contact/project names.
 *
 * Returns null when not found OR RLS-denied (indistinguishable, by design — a
 * non-member developer gets zero rows here too).
 */
export async function getMilestone(id: string) {
  const uid = await requireUid();
  const milestoneId = uuidSchema.parse(id);
  const dev = await isDeveloper();

  // Members are visible to both shapes (developer sees only their own row via
  // milestone_members_select; that is acceptable for the chip display).
  const membersQuery = sql`
    SELECT mm.user_id, u.full_name, u.email, mm.role, mm.created_at
    FROM milestone_members mm
    JOIN users u ON u.id = mm.user_id
    WHERE mm.milestone_id = ${milestoneId}::uuid
    ORDER BY mm.created_at
  `;

  const progressQuery = sql`
    SELECT completion_pct, total_tasks, done_tasks
    FROM v_milestone_progress
    WHERE milestone_id = ${milestoneId}::uuid
  `;

  if (dev) {
    // PARTIAL projection: read v_milestone_dev ONLY. NEVER touch billing/rollup.
    const [milestoneRows, members, progressRows] = await Promise.all([
      asUser(
        uid,
        sql`SELECT * FROM v_milestone_dev WHERE id = ${milestoneId}::uuid`,
      ),
      asUser(uid, membersQuery),
      asUser(uid, progressQuery),
    ]);
    const milestone = milestoneRows[0] ?? null;
    if (!milestone) return null;

    const m = milestone as { project_id: string | null };
    const projectRows = m.project_id
      ? await asUser(
          uid,
          sql`SELECT id, name, display_id FROM projects WHERE id = ${m.project_id}::uuid`,
        )
      : [];

    return {
      is_dev: true as const,
      milestone,
      billing: null,
      progress: progressRows[0] ?? null,
      members,
      contact: null,
      project: projectRows[0] ?? null,
    };
  }

  // FULL projection: rollup + billing + progress + spine names.
  const [milestoneRows, billingRows, progressRows, members] = await Promise.all([
    asUser(
      uid,
      sql`SELECT * FROM v_milestone_rollup WHERE id = ${milestoneId}::uuid`,
    ),
    asUser(
      uid,
      sql`SELECT agreed, currency, received, outstanding, pct_collected FROM v_milestone_billing WHERE milestone_id = ${milestoneId}::uuid`,
    ),
    asUser(uid, progressQuery),
    asUser(uid, membersQuery),
  ]);

  const milestone = milestoneRows[0] ?? null;
  if (!milestone) return null;

  const m = milestone as { contact_id: string | null; project_id: string | null };

  // Spine names (best-effort; RLS may deny for some roles → header omits them).
  const [contactRows, projectRows] = await Promise.all([
    m.contact_id
      ? asUser(
          uid,
          sql`SELECT id, full_name FROM contacts WHERE id = ${m.contact_id}::uuid`,
        )
      : Promise.resolve([]),
    m.project_id
      ? asUser(
          uid,
          sql`SELECT id, name, display_id FROM projects WHERE id = ${m.project_id}::uuid`,
        )
      : Promise.resolve([]),
  ]);

  return {
    is_dev: false as const,
    milestone,
    billing: billingRows[0] ?? null,
    progress: progressRows[0] ?? null,
    members,
    contact: contactRows[0] ?? null,
    project: projectRows[0] ?? null,
  };
}

export type MilestoneTaskRow = {
  id: string;
  display_id: string;
  title: string;
  status: string;
  priority: string | null;
  plan_due_date: string | null;
  schedule_state: string | null;
  primary_pm_id: string | null;
  primary_pm_name: string | null;
};

/**
 * listMilestoneTasks — the tasks under a milestone, for the detail cockpit's
 * center Tasks list. ROLE-SAFE:
 *   developer → v_task_dev (client identity stripped; schedule_state computed),
 *   others    → tasks (raw) joined to the PM name.
 * Both are RLS-gated (tasks_select → fn_can_see('milestone'…)): a non-member
 * developer sees zero rows here too. Tasks under a milestone are parent_type=
 * 'milestone' with milestone_id set; we filter on milestone_id (the cached spine).
 */
export async function listMilestoneTasks(
  id: string,
): Promise<MilestoneTaskRow[]> {
  const uid = await requireUid();
  const milestoneId = uuidSchema.parse(id);
  const dev = await isDeveloper();

  const query = dev
    ? sql`
        SELECT
          t.id, t.display_id, t.title, t.status::text AS status,
          t.priority::text AS priority, t.plan_due_date, t.schedule_state,
          t.primary_pm_id, u.full_name AS primary_pm_name
        FROM v_task_dev t
        LEFT JOIN users u ON u.id = t.primary_pm_id
        WHERE t.milestone_id = ${milestoneId}::uuid
        ORDER BY
          CASE t.status WHEN 'done' THEN 1 ELSE 0 END,
          t.plan_due_date NULLS LAST,
          t.created_at
        LIMIT 200
      `
    : sql`
        SELECT
          t.id, t.display_id, t.title, t.status::text AS status,
          t.priority::text AS priority, t.plan_due_date,
          fn_schedule_state(
            t.start_date, t.plan_due_date, t.execution_end_date, NULL, t.status::text
          ) AS schedule_state,
          t.primary_pm_id, u.full_name AS primary_pm_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.primary_pm_id
        WHERE t.milestone_id = ${milestoneId}::uuid
          AND t.archived_at IS NULL
        ORDER BY
          CASE t.status WHEN 'done' THEN 1 ELSE 0 END,
          t.plan_due_date NULLS LAST,
          t.created_at
        LIMIT 200
      `;
  return asUser<MilestoneTaskRow>(uid, query);
}

export type MilestoneTestRow = {
  id: string;
  test_type: string; // 'developer' | 'uat'
  title: string | null;
  outcome: string | null; // 'pass' | 'fail' | null
  tester_role: string | null;
  conducted_at: string | null;
  passed_at: string | null;
};

/**
 * listMilestoneTests — the dev + UAT tests for a milestone (tests table,
 * parent_type='milestone'). Tests carry NO money/client columns, so the shape is
 * identical for both projections — RLS (tests_select → fn_can_see('milestone'…))
 * is the only gate, so a non-member developer sees zero rows. Read-only here.
 */
export async function listMilestoneTests(
  id: string,
): Promise<MilestoneTestRow[]> {
  const uid = await requireUid();
  const milestoneId = uuidSchema.parse(id);

  return asUser<MilestoneTestRow>(
    uid,
    sql`
      SELECT
        id, test_type::text AS test_type, title, outcome::text AS outcome,
        tester_role::text AS tester_role, conducted_at, passed_at
      FROM tests
      WHERE parent_type = 'milestone'::entity_type
        AND parent_id = ${milestoneId}::uuid
        AND archived_at IS NULL
      ORDER BY test_type, created_at
    `,
  );
}

// ---------------------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------------------

/**
 * createMilestone — INSERT. name + project_id REQUIRED. display_id (M#) is
 * assigned by the fn_assign_display_id trigger per project (do NOT set it).
 * contact_id / company_id are trigger-cached from the project (do NOT set them).
 * RLS milestones_insert restricts this to admin/pm — sales/finance/developer are
 * rejected at the DB layer (zero rows returned).
 */
export async function createMilestone(input: CreateMilestoneInput) {
  const uid = await requireUid();
  const data = createMilestoneSchema.parse(input);

  const query = sql`
    INSERT INTO milestones (
      name, project_id, status, target_date,
      estimated_hours, price, currency
    )
    VALUES (
      ${data.name},
      ${data.project_id}::uuid,
      COALESCE(${data.status ?? null}::milestone_status, 'not_started'::milestone_status),
      ${data.target_date ?? null}::date,
      ${data.estimated_hours ?? null},
      ${data.price ?? null},
      ${data.currency ?? null}
    )
    RETURNING id
  `;
  const rows = await asUser<{ id: string }>(uid, query);
  if (rows.length === 0) {
    throw new Error('Create not permitted (admin/pm only) or invalid input');
  }
  return rows[0];
}

/**
 * updateMilestoneField — single-column PATCH. `field` MUST be in the allowlist;
 * any other field is rejected before the DB is touched. One UPDATE. RLS gates it
 * (fn_can_edit('milestone') is admin/pm only → developer UPDATEs return zero rows).
 */
export async function updateMilestoneField(
  id: string,
  field: string,
  value: unknown,
) {
  const uid = await requireUid();
  const milestoneId = uuidSchema.parse(id);

  if (!EDITABLE_SET.has(field)) {
    throw new Error(`Field not editable: ${field}`);
  }

  const rows = await asUser(
    uid,
    buildUpdate(field as EditableField, milestoneId, value),
  );
  if (rows.length === 0) {
    // Zero rows = RLS denied the write or the id doesn't exist.
    throw new Error('Update not permitted or milestone not found');
  }
  return rows[0];
}

/**
 * archiveMilestone — the "delete" action. Sets archived_at. NEVER a DELETE.
 */
export async function archiveMilestone(id: string) {
  const uid = await requireUid();
  const milestoneId = uuidSchema.parse(id);

  const rows = await asUser(
    uid,
    sql`
      UPDATE milestones
      SET archived_at = now(), updated_at = now()
      WHERE id = ${milestoneId}::uuid AND archived_at IS NULL
      RETURNING id, archived_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Archive not permitted or milestone not found');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// TEAM (milestone_members join — multi-PM + multi-dev, role pm|developer)
// DELETE on the join is the documented exception. INSERT/DELETE are admin/pm
// only (RLS milestone_members_insert / milestone_members_delete).
// ---------------------------------------------------------------------------

const roleSchema = z.enum(['pm', 'developer']);

export async function addMilestoneMember(
  milestoneId: string,
  userId: string,
  role: string,
) {
  const uid = await requireUid();
  const mId = uuidSchema.parse(milestoneId);
  const uId = uuidSchema.parse(userId);
  const r = roleSchema.parse(role);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO milestone_members (milestone_id, user_id, role)
      VALUES (${mId}::uuid, ${uId}::uuid, ${r}::user_role)
      ON CONFLICT (milestone_id, user_id) DO NOTHING
      RETURNING id, milestone_id, user_id, role, created_at
    `,
  );
  return rows[0] ?? null; // null if it already existed (idempotent add)
}

export async function removeMilestoneMember(milestoneId: string, userId: string) {
  const uid = await requireUid();
  const mId = uuidSchema.parse(milestoneId);
  const uId = uuidSchema.parse(userId);

  // Join-table membership removal — the documented DELETE exception.
  const rows = await asUser(
    uid,
    sql`
      DELETE FROM milestone_members
      WHERE milestone_id = ${mId}::uuid AND user_id = ${uId}::uuid
      RETURNING id
    `,
  );
  return { removed: rows.length > 0 };
}
