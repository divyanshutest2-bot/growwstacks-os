'use server';

// lib/actions/projects.ts — Projects data-layer server actions.
//
// 🚨 THE WHOLE POINT OF THIS SLICE — role-branched view selection.
// RLS enforces ROWS; the money/client COLUMN stripping is enforced by reading
// the RIGHT view per role. With a single app DB role, column grants are
// unavailable, so this server-side branch IS the field-security boundary:
//
//   role === 'developer'  → read v_project_dev   (deal_id / contact_id /
//                            company_id / billing are PHYSICALLY ABSENT)
//   otherwise (admin/pm/   → read v_project_rollup (full) + v_project_billing
//   finance/sales)
//
// A developer NEVER has the rollup or billing returned to them. v_project_billing
// is fetched ONLY for non-developer roles. RLS is defence-in-depth underneath:
// a developer who is not a project member sees zero rows from EITHER view.
//
// Other rules enforced here (CLAUDE.md):
//   - Every DB call goes through asUser(uid, ...) so RLS authorizes it.
//   - NO DELETE on the projects entity — "delete" = archiveProject (sets
//     archived_at). project_members IS the documented DELETE exception
//     (membership removal is a legitimate state change).
//   - No stored derived values: completion_pct / schedule_state / billing are
//     READ from the views, never written.
//   - Field-level auto-save: updateProjectField PATCHes ONE allowlisted column.
//   - Team is the join table (project_members, role pm|developer); authoritative.
//     project_manager_id is a cached HEADER pointer only.
//   - contact_id / company_id are CACHED from the deal via trigger — NEVER set
//     here. deal_id is set at create time only (not editable).
//   - Create = admin/pm ONLY (RLS projects_insert; sales/finance/developer can't).
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

/** True when the caller is a developer → partial projection (v_project_dev). */
async function isDeveloper(): Promise<boolean> {
  return (await getCurrentUserRole()) === 'developer';
}

// ---------------------------------------------------------------------------
// Editable-column allowlist (field-level auto-save). Any field NOT in this set
// is rejected before touching the DB. RLS still independently authorizes the row
// (fn_can_edit('project') is admin/pm only → developers' UPDATEs are denied).
//   - deal_id is set at create time only (not editable; reassigning re-caches
//     the whole spine — out of scope).
//   - contact_id / company_id are trigger-cached from the deal — NEVER editable.
//   - display_id is trigger-assigned — never set.
//   - project_manager_id is a cached HEADER pointer (editable, but not the
//     authoritative team — that is project_members).
// ---------------------------------------------------------------------------
const EDITABLE_FIELDS = [
  'name',
  'status',
  'start_date',
  'estimated_completion_date',
  'actual_completion_date',
  'estimated_hours',
  'team_logger_project_name',
  'team_logger_project_id',
  'project_manager_id',
  'requirement',
  'overview',
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
      return sql`UPDATE projects SET name = ${value as string}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'status':
      return sql`UPDATE projects SET status = ${value as string}::project_status, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'start_date':
      return sql`UPDATE projects SET start_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'estimated_completion_date':
      return sql`UPDATE projects SET estimated_completion_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'actual_completion_date':
      return sql`UPDATE projects SET actual_completion_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'estimated_hours':
      return sql`UPDATE projects SET estimated_hours = ${value as number | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'team_logger_project_name':
      return sql`UPDATE projects SET team_logger_project_name = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'team_logger_project_id':
      return sql`UPDATE projects SET team_logger_project_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'project_manager_id':
      return sql`UPDATE projects SET project_manager_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'requirement':
      return sql`UPDATE projects SET requirement = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'overview':
      return sql`UPDATE projects SET overview = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
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
    status: z.string().min(1).optional(),
    member: z.string().uuid().optional(),
    search: z.string().min(1).max(200).optional(),
  })
  .strict()
  .optional();

export type ProjectListFilters = z.infer<typeof listFiltersSchema>;

const createProjectSchema = z
  .object({
    name: z.string().min(1).max(300),
    deal_id: z.string().uuid().nullish(), // optional — internal projects have none
    status: z.string().min(1).nullish(),
    start_date: z.string().min(1).nullish(),
    estimated_completion_date: z.string().min(1).nullish(),
    estimated_hours: z.number().nullish(),
    project_manager_id: z.string().uuid().nullish(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// ---------------------------------------------------------------------------
// READS — every read role-branches the view (the column-security boundary).
// ---------------------------------------------------------------------------

/**
 * listProjects — non-archived projects.
 *
 * 🚨 ROLE-BRANCH: developer → v_project_dev (partial, no money/client columns);
 * everyone else → v_project_rollup (full). Both views already filter
 * archived_at IS NULL and RLS restricts ROWS (a developer sees only the projects
 * they are a member of). Filters: status, member (project_members join), search.
 */
export async function listProjects(filters?: ProjectListFilters) {
  const uid = await requireUid();
  const dev = await isDeveloper();
  const f = listFiltersSchema.parse(filters) ?? {};

  const status = f.status ?? null;
  const memberId = f.member ?? null;
  const search = f.search ? `%${f.search}%` : null;

  // Two static statements (one per view) — never string-built. The member filter
  // checks project_members (the authoritative join), NOT the cached
  // project_manager_id pointer.
  const query = dev
    ? sql`
        SELECT *
        FROM v_project_dev
        WHERE (${status}::text IS NULL OR status::text = ${status})
          AND (
            ${memberId}::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM project_members pm2
              WHERE pm2.project_id = v_project_dev.id AND pm2.user_id = ${memberId}::uuid
            )
          )
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
        FROM v_project_rollup
        WHERE (${status}::text IS NULL OR status::text = ${status})
          AND (
            ${memberId}::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM project_members pm2
              WHERE pm2.project_id = v_project_rollup.id AND pm2.user_id = ${memberId}::uuid
            )
          )
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

export type ProjectMemberRow = {
  project_id: string;
  user_id: string;
  full_name: string | null;
  role: string;
};

/**
 * listMembersForProjects — batch fetch members for a set of projects so the list
 * can render member chips per row without N+1 reads. RLS-gated: a developer only
 * sees their OWN membership rows (project_members_select), which is fine — their
 * list rows are theirs anyway.
 */
export async function listMembersForProjects(
  projectIds: string[],
): Promise<ProjectMemberRow[]> {
  const uid = await requireUid();
  if (projectIds.length === 0) return [];
  return asUser<ProjectMemberRow>(
    uid,
    sql`
      SELECT pm.project_id, pm.user_id, pm.role, u.full_name
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ANY(${projectIds}::uuid[])
      ORDER BY pm.created_at
    `,
  );
}

export type ProjectBillingRow = {
  project_id: string;
  agreed: string | number | null;
  currency: string | null;
};

/**
 * listBillingForProjects — batch fetch the agreed contract value per project for
 * the LIST's billing column.
 *
 * 🚨 NON-DEVELOPER ONLY. v_project_billing has no developer SELECT policy
 * (migrations/0010), and the Projects page calls this ONLY for non-developer
 * roles. The hard guard below makes the wall explicit: a developer caller gets an
 * empty map, never a money read.
 */
export async function listBillingForProjects(
  projectIds: string[],
): Promise<ProjectBillingRow[]> {
  const uid = await requireUid();
  if (await isDeveloper()) return []; // wall: developers never read billing
  if (projectIds.length === 0) return [];
  return asUser<ProjectBillingRow>(
    uid,
    sql`
      SELECT project_id, agreed, currency
      FROM v_project_billing
      WHERE project_id = ANY(${projectIds}::uuid[])
    `,
  );
}

export type DealPickerOption = {
  id: string;
  name: string;
  display_id: string;
};

/**
 * listDealOptions — deal picker for the Create Project dialog. A project MAY hang
 * off a deal (optional; internal projects have none). RLS-gated: developers get
 * zero deals (no deals_select policy), but developers can't create projects
 * anyway, so the picker is only ever populated for admin/pm.
 */
export async function listDealOptions(): Promise<DealPickerOption[]> {
  const uid = await requireUid();
  return asUser<DealPickerOption>(
    uid,
    sql`
      SELECT id, name, display_id
      FROM deals
      WHERE archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 500
    `,
  );
}

/**
 * getProject — one project + members. Returns a DISCRIMINATED payload:
 *
 * 🚨 ROLE-BRANCH:
 *   developer → { is_dev: true } reads v_project_dev; billing/contact/deal are
 *     NOT fetched and returned as null (the dev view has no deal_id/contact_id to
 *     even join on). Delivery only.
 *   non-developer → { is_dev: false } reads v_project_rollup + v_project_billing
 *     + resolves the parent contact/deal names.
 *
 * Returns null when not found OR RLS-denied (indistinguishable, by design — a
 * non-member developer gets zero rows here too).
 */
export async function getProject(id: string) {
  const uid = await requireUid();
  const projectId = uuidSchema.parse(id);
  const dev = await isDeveloper();

  // Members are visible to both shapes (developer sees only their own row via
  // project_members_select; that is acceptable for the chip display).
  const membersQuery = sql`
    SELECT pm.user_id, u.full_name, u.email, pm.role, pm.created_at
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ${projectId}::uuid
    ORDER BY pm.created_at
  `;

  if (dev) {
    // PARTIAL projection: read v_project_dev ONLY. NEVER touch billing/rollup.
    const [projectRows, members] = await Promise.all([
      asUser(uid, sql`SELECT * FROM v_project_dev WHERE id = ${projectId}::uuid`),
      asUser(uid, membersQuery),
    ]);
    const project = projectRows[0] ?? null;
    if (!project) return null;
    return {
      is_dev: true as const,
      project,
      billing: null,
      members,
      contact: null,
      deal: null,
    };
  }

  // FULL projection: rollup + billing + spine names.
  const [projectRows, billingRows, members] = await Promise.all([
    asUser(uid, sql`SELECT * FROM v_project_rollup WHERE id = ${projectId}::uuid`),
    asUser(
      uid,
      sql`SELECT agreed, currency, received, outstanding, pct_collected FROM v_project_billing WHERE project_id = ${projectId}::uuid`,
    ),
    asUser(uid, membersQuery),
  ]);

  const project = projectRows[0] ?? null;
  if (!project) return null;

  const p = project as { contact_id: string | null; deal_id: string | null };

  // Spine names (best-effort; RLS may deny for some roles → header omits them).
  const [contactRows, dealRows] = await Promise.all([
    p.contact_id
      ? asUser(
          uid,
          sql`SELECT id, full_name FROM contacts WHERE id = ${p.contact_id}::uuid`,
        )
      : Promise.resolve([]),
    p.deal_id
      ? asUser(
          uid,
          sql`SELECT id, name, display_id FROM deals WHERE id = ${p.deal_id}::uuid`,
        )
      : Promise.resolve([]),
  ]);

  return {
    is_dev: false as const,
    project,
    billing: billingRows[0] ?? null,
    members,
    contact: contactRows[0] ?? null,
    deal: dealRows[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------------------

/**
 * createProject — INSERT. name required; deal_id optional (internal projects have
 * none). display_id is assigned by the fn_assign_display_id trigger (do NOT set
 * it). contact_id / company_id are trigger-cached from the deal (do NOT set them).
 * RLS projects_insert restricts this to admin/pm — sales/finance/developer are
 * rejected at the DB layer (zero rows returned).
 */
export async function createProject(input: CreateProjectInput) {
  const uid = await requireUid();
  const data = createProjectSchema.parse(input);

  const query = sql`
    INSERT INTO projects (
      name, deal_id, status, start_date,
      estimated_completion_date, estimated_hours, project_manager_id
    )
    VALUES (
      ${data.name},
      ${data.deal_id ?? null},
      COALESCE(${data.status ?? null}::project_status, 'upcoming'::project_status),
      ${data.start_date ?? null}::date,
      ${data.estimated_completion_date ?? null}::date,
      ${data.estimated_hours ?? null},
      ${data.project_manager_id ?? null}
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
 * updateProjectField — single-column PATCH. `field` MUST be in the allowlist;
 * any other field is rejected before the DB is touched. One UPDATE. RLS gates it
 * (fn_can_edit('project') is admin/pm only → developer UPDATEs return zero rows).
 */
export async function updateProjectField(
  id: string,
  field: string,
  value: unknown,
) {
  const uid = await requireUid();
  const projectId = uuidSchema.parse(id);

  if (!EDITABLE_SET.has(field)) {
    throw new Error(`Field not editable: ${field}`);
  }

  const rows = await asUser(
    uid,
    buildUpdate(field as EditableField, projectId, value),
  );
  if (rows.length === 0) {
    // Zero rows = RLS denied the write or the id doesn't exist.
    throw new Error('Update not permitted or project not found');
  }
  return rows[0];
}

/**
 * archiveProject — the "delete" action. Sets archived_at. NEVER a DELETE.
 */
export async function archiveProject(id: string) {
  const uid = await requireUid();
  const projectId = uuidSchema.parse(id);

  const rows = await asUser(
    uid,
    sql`
      UPDATE projects
      SET archived_at = now(), updated_at = now()
      WHERE id = ${projectId}::uuid AND archived_at IS NULL
      RETURNING id, archived_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Archive not permitted or project not found');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// TEAM (project_members join — multi-PM + multi-dev, role pm|developer)
// DELETE on the join is the documented exception. INSERT/DELETE are admin/pm
// only (RLS project_members_insert / project_members_delete).
// ---------------------------------------------------------------------------

const roleSchema = z.enum(['pm', 'developer']);

export async function addProjectMember(
  projectId: string,
  userId: string,
  role: string,
) {
  const uid = await requireUid();
  const pId = uuidSchema.parse(projectId);
  const uId = uuidSchema.parse(userId);
  const r = roleSchema.parse(role);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${pId}::uuid, ${uId}::uuid, ${r}::user_role)
      ON CONFLICT (project_id, user_id) DO NOTHING
      RETURNING id, project_id, user_id, role, created_at
    `,
  );
  return rows[0] ?? null; // null if it already existed (idempotent add)
}

export async function removeProjectMember(projectId: string, userId: string) {
  const uid = await requireUid();
  const pId = uuidSchema.parse(projectId);
  const uId = uuidSchema.parse(userId);

  // Join-table membership removal — the documented DELETE exception.
  const rows = await asUser(
    uid,
    sql`
      DELETE FROM project_members
      WHERE project_id = ${pId}::uuid AND user_id = ${uId}::uuid
      RETURNING id
    `,
  );
  return { removed: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// RELATED READS — the cockpit's center/right-rail delivery modules.
//
// 🚨 Each related read ALSO role-branches the view (same column-security boundary
// as listProjects/getProject):
//   developer → v_milestone_dev / v_task_dev (NO contact/company/price columns)
//   others    → v_milestone_rollup / v_task_rollup (full)
// getProjectDeal is non-developer ONLY — the developer projection never resolves
// the client/deal spine, so it is not even called for a developer.
// ---------------------------------------------------------------------------

/**
 * listProjectMilestones — the project's milestones for the cockpit Milestones tab
 * / related card. Role-safe: developers read v_milestone_dev (delivery only); RLS
 * restricts rows to the milestones the caller can see. Ordered by display_id so
 * the milestone numbers read sequentially.
 */
export async function listProjectMilestones(projectId: string) {
  const uid = await requireUid();
  const pId = uuidSchema.parse(projectId);
  const dev = await isDeveloper();

  const query = dev
    ? sql`
        SELECT id, display_id, name, status, start_date, target_date,
               actual_completion_date, completion_pct, schedule_state
        FROM v_milestone_dev
        WHERE project_id = ${pId}::uuid
        ORDER BY display_id
      `
    : sql`
        SELECT id, display_id, name, status, start_date, target_date,
               actual_completion_date, completion_pct, schedule_state,
               total_tasks, done_tasks, price, currency
        FROM v_milestone_rollup
        WHERE project_id = ${pId}::uuid
        ORDER BY display_id
      `;
  return asUser(uid, query);
}

/**
 * listProjectTasks — tasks for the cockpit Tasks tab.
 *
 * 🚨 For a DEVELOPER this is the "My tasks" projection: it returns ONLY tasks the
 * developer is an assignee of (task_assignees join), read from v_task_dev (no
 * client/money columns). For full roles it returns ALL of the project's tasks
 * (v_task_rollup). RLS is defence-in-depth underneath either path.
 */
export async function listProjectTasks(projectId: string) {
  const uid = await requireUid();
  const pId = uuidSchema.parse(projectId);
  const dev = await isDeveloper();

  const query = dev
    ? sql`
        SELECT id, display_id, title, status, priority, delivery_state,
               start_date, plan_due_date, execution_end_date, schedule_state
        FROM v_task_dev
        WHERE project_id = ${pId}::uuid
          AND EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = v_task_dev.id AND ta.user_id = ${uid}::uuid
          )
        ORDER BY created_at DESC
        LIMIT 500
      `
    : sql`
        SELECT id, display_id, title, status, priority, delivery_state,
               start_date, plan_due_date, execution_end_date, schedule_state
        FROM v_task_rollup
        WHERE project_id = ${pId}::uuid
        ORDER BY created_at DESC
        LIMIT 500
      `;
  return asUser(uid, query);
}

/**
 * getProjectDeal — the linked deal spine for the FULL projection's Details card.
 *
 * 🚨 NON-DEVELOPER ONLY. The caller (getProject) returns the deal in its full-
 * projection payload already; this is a thin standalone read for any surface that
 * needs the deal by project id. It is NEVER invoked on the developer path — a
 * developer has no deal_id to resolve and no deals_select RLS policy anyway.
 * Returns null when the project has no deal or RLS denies it.
 */
export async function getProjectDeal(projectId: string) {
  const uid = await requireUid();
  const pId = uuidSchema.parse(projectId);
  if (await isDeveloper()) return null; // hard guard: never resolve the client spine for a dev

  const rows = await asUser<{
    id: string;
    name: string;
    display_id: string;
    deal_value: string | number | null;
    currency: string | null;
    stage: string | null;
  }>(
    uid,
    sql`
      SELECT d.id, d.name, d.display_id, d.deal_value, d.currency, d.stage::text AS stage
      FROM projects p
      JOIN deals d ON d.id = p.deal_id
      WHERE p.id = ${pId}::uuid AND d.archived_at IS NULL
    `,
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// CONVERSATION SEND (record-only stub). Inserts an OUTBOUND conversation_entry
// authored by the caller on parent_type='project'. It does NOT deliver to the
// external channel — delivery is the n8n sync layer's job (Phase 2). Mirrors
// contacts.sendMessage / companies.sendCompanyMessage. RLS gates the insert
// (fn_can_edit('project', id)); a developer member can record on their project.
// ---------------------------------------------------------------------------
const sendProjectMessageSchema = z
  .object({
    channel: z.string().min(1).max(40),
    body: z.string().min(1).max(20000),
  })
  .strict();

export type SendProjectMessageInput = z.infer<typeof sendProjectMessageSchema>;

export async function sendProjectMessage(
  projectId: string,
  input: SendProjectMessageInput,
) {
  const uid = await requireUid();
  const pId = uuidSchema.parse(projectId);
  const data = sendProjectMessageSchema.parse(input);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO conversation_entries
        (parent_type, parent_id, channel, direction, sender_user_id, body, occurred_at)
      VALUES (
        'project'::entity_type,
        ${pId}::uuid,
        ${data.channel}::conversation_channel,
        'outbound'::message_direction,
        ${uid}::uuid,
        ${data.body},
        now()
      )
      RETURNING id, channel, direction, body, occurred_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Send not permitted');
  }
  // Honest: recorded locally, NOT delivered to the external channel.
  return { recorded: true, entry: rows[0] };
}
