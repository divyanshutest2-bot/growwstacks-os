'use server';

// lib/actions/tasks.ts — Tasks data-layer server actions.
//
// 🚨 THE WHOLE POINT OF THIS SLICE — role-branched view selection.
// RLS enforces ROWS; the CLIENT-identity COLUMN stripping is enforced by reading
// the RIGHT view per role. With a single app DB role, column grants are
// unavailable, so this server-side branch IS the field-security boundary:
//
//   role === 'developer'  → read v_task_dev    (contact_id / company_id are
//                            PHYSICALLY ABSENT — client identity stripped)
//   otherwise (admin/pm/   → read v_task_rollup (full, incl. contact_id /
//   finance/sales)           company_id + computeds)
//
// NOTE: tasks have NO money columns (no agreed/received/billing). The wall here
// is purely CLIENT IDENTITY (contact / company). A developer NEVER has the
// contact name resolved. RLS is defence-in-depth underneath: a developer who is
// not an assignee (and not a project member of the parent milestone) sees zero
// rows from EITHER view.
//
// Other rules enforced here (CLAUDE.md):
//   - Every DB call goes through asUser(uid, ...) so RLS authorizes it.
//   - NO DELETE on the tasks entity — "delete" = archiveTask (sets archived_at).
//     task_assignees / task_managers ARE the documented DELETE exception
//     (membership removal is a legitimate state change).
//   - No stored derived values: schedule_state / time_spent / test counts are
//     READ from the views, never written.
//   - Field-level auto-save: updateTaskField PATCHes ONE allowlisted column. The
//     headline field is `status` (kanban-status auto-save dropdown).
//   - Assignees/managers are join tables (task_assignees / task_managers);
//     authoritative. primary_pm_id is a cached HEADER pointer only.
//   - parent_type/parent_id are set at create time only; project_id /
//     milestone_id / contact_id / company_id are TRIGGER-CACHED — NEVER set here.
//   - display_id (T-#) is trigger-assigned — NEVER set.
//   - Create = admin/pm ONLY (RLS tasks_insert; sales/finance/developer can't).
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

/** True when the caller is a developer → partial projection (v_task_dev). */
async function isDeveloper(): Promise<boolean> {
  return (await getCurrentUserRole()) === 'developer';
}

// ---------------------------------------------------------------------------
// Editable-column allowlist (field-level auto-save). Any field NOT in this set
// is rejected before touching the DB. RLS still independently authorizes the row
// (fn_can_edit('task') is admin/pm, or developer IF assignee → developer
// assignees CAN edit their own tasks).
//   - parent_type / parent_id are create-only (reassigning re-caches the whole
//     spine — out of scope).
//   - contact_id / company_id / project_id / milestone_id are trigger-cached —
//     NEVER editable.
//   - display_id is trigger-assigned — never set.
//   - primary_pm_id is a cached HEADER pointer (editable, but not the
//     authoritative manager set — that is task_managers).
// ---------------------------------------------------------------------------
const EDITABLE_FIELDS = [
  'title',
  'status',
  'delivery_state',
  'priority',
  'start_date',
  'plan_due_date',
  'execution_start_date',
  'execution_end_date',
  'time_reported_hours',
  'requirement',
  'details',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
const EDITABLE_SET = new Set<string>(EDITABLE_FIELDS);

// Map each editable field to a tagged-template UPDATE. A column NAME cannot be a
// SQL parameter (only values are parameterized), so we keep a static map of full
// statements — every column name is a hard-coded literal, never user-controlled.
// The VALUE is always parameterized (injection-safe).
function buildUpdate(field: EditableField, id: string, value: unknown) {
  switch (field) {
    case 'title':
      return sql`UPDATE tasks SET title = ${value as string}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'status':
      return sql`UPDATE tasks SET status = ${value as string}::task_status, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'delivery_state':
      return sql`UPDATE tasks SET delivery_state = ${value as string}::task_delivery_state, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'priority':
      return sql`UPDATE tasks SET priority = ${value as string | null}::priority, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'start_date':
      return sql`UPDATE tasks SET start_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'plan_due_date':
      return sql`UPDATE tasks SET plan_due_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'execution_start_date':
      return sql`UPDATE tasks SET execution_start_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'execution_end_date':
      return sql`UPDATE tasks SET execution_end_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'time_reported_hours':
      return sql`UPDATE tasks SET time_reported_hours = ${value as number | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'requirement':
      return sql`UPDATE tasks SET requirement = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
    case 'details':
      return sql`UPDATE tasks SET details = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING id`;
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
    assignee: z.string().uuid().optional(),
    milestone: z.string().uuid().optional(),
    search: z.string().min(1).max(200).optional(),
  })
  .strict()
  .optional();

export type TaskListFilters = z.infer<typeof listFiltersSchema>;

const parentTypeSchema = z.enum(['milestone', 'deal', 'payment']);

const createTaskSchema = z
  .object({
    title: z.string().min(1).max(300),
    parent_type: parentTypeSchema,
    parent_id: z.string().uuid(),
    status: z.string().min(1).nullish(),
    priority: z.string().min(1).nullish(),
    start_date: z.string().min(1).nullish(),
    plan_due_date: z.string().min(1).nullish(),
  })
  .strict();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// ---------------------------------------------------------------------------
// READS — every read role-branches the view (the column-security boundary).
// ---------------------------------------------------------------------------

/**
 * listTasks — non-archived tasks.
 *
 * 🚨 ROLE-BRANCH: developer → v_task_dev (partial, no contact/company columns);
 * everyone else → v_task_rollup (full). Both views already filter archived_at IS
 * NULL and RLS restricts ROWS (a developer sees only tasks they are an assignee
 * of, or tasks within milestones they can see). Filters: status, assignee
 * (task_assignees join), milestone, search.
 */
export async function listTasks(filters?: TaskListFilters) {
  const uid = await requireUid();
  const dev = await isDeveloper();
  const f = listFiltersSchema.parse(filters) ?? {};

  const status = f.status ?? null;
  const assigneeId = f.assignee ?? null;
  const milestoneId = f.milestone ?? null;
  const search = f.search ? `%${f.search}%` : null;

  // Two static statements (one per view) — never string-built. The assignee
  // filter checks task_assignees (the authoritative join), NOT the cached
  // primary_pm_id pointer.
  const query = dev
    ? sql`
        SELECT *
        FROM v_task_dev
        WHERE (${status}::text IS NULL OR status::text = ${status})
          AND (
            ${assigneeId}::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM task_assignees ta2
              WHERE ta2.task_id = v_task_dev.id AND ta2.user_id = ${assigneeId}::uuid
            )
          )
          AND (${milestoneId}::uuid IS NULL OR milestone_id = ${milestoneId}::uuid)
          AND (
            ${search}::text IS NULL
            OR title ILIKE ${search}
            OR display_id ILIKE ${search}
          )
        ORDER BY created_at DESC
        LIMIT 500
      `
    : sql`
        SELECT *
        FROM v_task_rollup
        WHERE (${status}::text IS NULL OR status::text = ${status})
          AND (
            ${assigneeId}::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM task_assignees ta2
              WHERE ta2.task_id = v_task_rollup.id AND ta2.user_id = ${assigneeId}::uuid
            )
          )
          AND (${milestoneId}::uuid IS NULL OR milestone_id = ${milestoneId}::uuid)
          AND (
            ${search}::text IS NULL
            OR title ILIKE ${search}
            OR display_id ILIKE ${search}
          )
        ORDER BY created_at DESC
        LIMIT 500
      `;
  return asUser(uid, query);
}

export type TaskAssigneeRow = {
  task_id: string;
  user_id: string;
  full_name: string | null;
};

/**
 * listAssigneesForTasks — batch fetch assignees for a set of tasks so the list
 * can render assignee chips per row without N+1 reads. RLS-gated: a developer
 * sees task_assignees rows that are their own OR (admin/pm/finance) all; a
 * developer's list rows are theirs anyway.
 */
export async function listAssigneesForTasks(
  taskIds: string[],
): Promise<TaskAssigneeRow[]> {
  const uid = await requireUid();
  if (taskIds.length === 0) return [];
  return asUser<TaskAssigneeRow>(
    uid,
    sql`
      SELECT ta.task_id, ta.user_id, u.full_name
      FROM task_assignees ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id = ANY(${taskIds}::uuid[])
      ORDER BY ta.created_at
    `,
  );
}

/**
 * listManagersForTasks — batch fetch managers (PMs) for a set of tasks so the
 * list can render the Manager avatar per row without N+1 reads. RLS-gated. The
 * task_managers join is authoritative (primary_pm_id is only a cached pointer).
 */
export async function listManagersForTasks(
  taskIds: string[],
): Promise<TaskAssigneeRow[]> {
  const uid = await requireUid();
  if (taskIds.length === 0) return [];
  return asUser<TaskAssigneeRow>(
    uid,
    sql`
      SELECT tm.task_id, tm.user_id, u.full_name
      FROM task_managers tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.task_id = ANY(${taskIds}::uuid[])
      ORDER BY tm.created_at
    `,
  );
}

export type MilestonePickerOption = {
  id: string;
  name: string;
  display_id: string;
};

/**
 * listMilestoneOptions — milestone picker for the Create Task dialog. A delivery
 * task hangs off a milestone (the default parent_type). RLS-gated: developers
 * get only milestones they can see, but developers can't create tasks anyway, so
 * the picker is only ever populated for admin/pm.
 */
export async function listMilestoneOptions(): Promise<MilestonePickerOption[]> {
  const uid = await requireUid();
  return asUser<MilestonePickerOption>(
    uid,
    sql`
      SELECT id, name, display_id
      FROM milestones
      WHERE archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 500
    `,
  );
}

/**
 * getTask — one task + assignees + managers. Returns a DISCRIMINATED payload:
 *
 * 🚨 ROLE-BRANCH:
 *   developer → { is_dev: true } reads v_task_dev; contact/company are NOT
 *     fetched and returned as null (the dev view has no contact_id to even join
 *     on). Delivery only. Milestone (delivery context) IS resolved.
 *   non-developer → { is_dev: false } reads v_task_rollup + resolves the parent
 *     contact (client identity) + milestone names.
 *
 * Returns null when not found OR RLS-denied (indistinguishable, by design — a
 * non-assignee developer gets zero rows here too).
 */
export async function getTask(id: string) {
  const uid = await requireUid();
  const taskId = uuidSchema.parse(id);
  const dev = await isDeveloper();

  // Assignees + managers are visible to both shapes (developer sees their own
  // join rows via *_select; acceptable for the chip display).
  const assigneesQuery = sql`
    SELECT ta.user_id, u.full_name, u.email, ta.created_at
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ${taskId}::uuid
    ORDER BY ta.created_at
  `;
  const managersQuery = sql`
    SELECT tm.user_id, u.full_name, u.email, tm.created_at
    FROM task_managers tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.task_id = ${taskId}::uuid
    ORDER BY tm.created_at
  `;

  if (dev) {
    // PARTIAL projection: read v_task_dev ONLY. NEVER resolve the client contact.
    const [taskRows, assignees, managers] = await Promise.all([
      asUser(uid, sql`SELECT * FROM v_task_dev WHERE id = ${taskId}::uuid`),
      asUser(uid, assigneesQuery),
      asUser(uid, managersQuery),
    ]);
    const task = taskRows[0] ?? null;
    if (!task) return null;

    // Milestone is delivery context (not client identity) — resolve it for the
    // header link. RLS may still deny it; best-effort.
    const t = task as { milestone_id: string | null };
    const milestoneRows = t.milestone_id
      ? await asUser(
          uid,
          sql`SELECT id, name, display_id FROM milestones WHERE id = ${t.milestone_id}::uuid`,
        )
      : [];

    return {
      is_dev: true as const,
      task,
      assignees,
      managers,
      contact: null,
      milestone: milestoneRows[0] ?? null,
    };
  }

  // FULL projection: rollup + client contact + milestone spine names.
  const [taskRows, assignees, managers] = await Promise.all([
    asUser(uid, sql`SELECT * FROM v_task_rollup WHERE id = ${taskId}::uuid`),
    asUser(uid, assigneesQuery),
    asUser(uid, managersQuery),
  ]);

  const task = taskRows[0] ?? null;
  if (!task) return null;

  const t = task as { contact_id: string | null; milestone_id: string | null };

  // Spine names (best-effort; RLS may deny for some roles → header omits them).
  const [contactRows, milestoneRows] = await Promise.all([
    t.contact_id
      ? asUser(
          uid,
          sql`SELECT id, full_name FROM contacts WHERE id = ${t.contact_id}::uuid`,
        )
      : Promise.resolve([]),
    t.milestone_id
      ? asUser(
          uid,
          sql`SELECT id, name, display_id FROM milestones WHERE id = ${t.milestone_id}::uuid`,
        )
      : Promise.resolve([]),
  ]);

  return {
    is_dev: false as const,
    task,
    assignees,
    managers,
    contact: contactRows[0] ?? null,
    milestone: milestoneRows[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------------------

/**
 * createTask — INSERT. title + parent_type + parent_id required. display_id (T-#)
 * is assigned by the fn_assign_display_id trigger (do NOT set it). project_id /
 * milestone_id / contact_id / company_id are trigger-cached from the parent (do
 * NOT set them). RLS tasks_insert restricts this to admin/pm — sales/finance/
 * developer are rejected at the DB layer (zero rows returned).
 */
export async function createTask(input: CreateTaskInput) {
  const uid = await requireUid();
  const data = createTaskSchema.parse(input);

  const query = sql`
    INSERT INTO tasks (
      title, parent_type, parent_id, status, priority, start_date, plan_due_date
    )
    VALUES (
      ${data.title},
      ${data.parent_type}::entity_type,
      ${data.parent_id}::uuid,
      COALESCE(${data.status ?? null}::task_status, 'todo'::task_status),
      COALESCE(${data.priority ?? null}::priority, 'medium'::priority),
      ${data.start_date ?? null}::date,
      ${data.plan_due_date ?? null}::date
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
 * updateTaskField — single-column PATCH. `field` MUST be in the allowlist; any
 * other field is rejected before the DB is touched. One UPDATE. RLS gates it
 * (fn_can_edit('task') is admin/pm, or a developer who is an assignee). The
 * headline use is `status` (the kanban-status auto-save dropdown).
 */
export async function updateTaskField(
  id: string,
  field: string,
  value: unknown,
) {
  const uid = await requireUid();
  const taskId = uuidSchema.parse(id);

  if (!EDITABLE_SET.has(field)) {
    throw new Error(`Field not editable: ${field}`);
  }

  const rows = await asUser(
    uid,
    buildUpdate(field as EditableField, taskId, value),
  );
  if (rows.length === 0) {
    // Zero rows = RLS denied the write or the id doesn't exist.
    throw new Error('Update not permitted or task not found');
  }
  return rows[0];
}

/**
 * archiveTask — the "delete" action. Sets archived_at. NEVER a DELETE.
 */
export async function archiveTask(id: string) {
  const uid = await requireUid();
  const taskId = uuidSchema.parse(id);

  const rows = await asUser(
    uid,
    sql`
      UPDATE tasks
      SET archived_at = now(), updated_at = now()
      WHERE id = ${taskId}::uuid AND archived_at IS NULL
      RETURNING id, archived_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Archive not permitted or task not found');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// ASSIGNEES (task_assignees join — multi-developer assignment)
// DELETE on the join is the documented exception. INSERT/DELETE are admin/pm
// only (RLS task_assignees_insert / task_assignees_delete).
// ---------------------------------------------------------------------------

export async function addTaskAssignee(taskId: string, userId: string) {
  const uid = await requireUid();
  const tId = uuidSchema.parse(taskId);
  const uId = uuidSchema.parse(userId);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO task_assignees (task_id, user_id)
      VALUES (${tId}::uuid, ${uId}::uuid)
      ON CONFLICT (task_id, user_id) DO NOTHING
      RETURNING id, task_id, user_id, created_at
    `,
  );
  return rows[0] ?? null; // null if it already existed (idempotent add)
}

export async function removeTaskAssignee(taskId: string, userId: string) {
  const uid = await requireUid();
  const tId = uuidSchema.parse(taskId);
  const uId = uuidSchema.parse(userId);

  // Join-table membership removal — the documented DELETE exception.
  const rows = await asUser(
    uid,
    sql`
      DELETE FROM task_assignees
      WHERE task_id = ${tId}::uuid AND user_id = ${uId}::uuid
      RETURNING id
    `,
  );
  return { removed: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// MANAGERS (task_managers join — multi-PM). primary_pm_id is a cached header
// pointer only; this join is authoritative. INSERT/DELETE are admin/pm only.
// ---------------------------------------------------------------------------

export async function addTaskManager(taskId: string, userId: string) {
  const uid = await requireUid();
  const tId = uuidSchema.parse(taskId);
  const uId = uuidSchema.parse(userId);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO task_managers (task_id, user_id)
      VALUES (${tId}::uuid, ${uId}::uuid)
      ON CONFLICT (task_id, user_id) DO NOTHING
      RETURNING id, task_id, user_id, created_at
    `,
  );
  return rows[0] ?? null; // null if it already existed (idempotent add)
}

export async function removeTaskManager(taskId: string, userId: string) {
  const uid = await requireUid();
  const tId = uuidSchema.parse(taskId);
  const uId = uuidSchema.parse(userId);

  // Join-table membership removal — the documented DELETE exception.
  const rows = await asUser(
    uid,
    sql`
      DELETE FROM task_managers
      WHERE task_id = ${tId}::uuid AND user_id = ${uId}::uuid
      RETURNING id
    `,
  );
  return { removed: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// RELATED READS for the cockpit center/right rails. All RLS-gated via asUser.
// These are DELIVERY-safe (no money / no client identity) so they are safe in
// BOTH projections — a developer assignee reads exactly what RLS permits.
// ---------------------------------------------------------------------------

/**
 * listTaskTests — dev + UAT tests for a task (tests table, parent_type='task').
 * RLS tests_select is fn_can_see('task', id), so an assignee developer sees the
 * task's tests; non-assignees see none. outcome is null until the test is
 * conducted (rendered as "pending"). No client identity is selected.
 */
export async function listTaskTests(id: string) {
  const uid = await requireUid();
  const taskId = uuidSchema.parse(id);
  return asUser(
    uid,
    sql`
      SELECT te.id, te.test_type::text AS test_type, te.title, te.brief,
             te.outcome::text AS outcome, te.tester_user_id,
             u.full_name AS tester_name, te.conducted_at, te.passed_at
      FROM tests te
      LEFT JOIN users u ON u.id = te.tester_user_id
      WHERE te.parent_type = 'task'::entity_type
        AND te.parent_id = ${taskId}::uuid
        AND te.archived_at IS NULL
      ORDER BY te.test_type, te.created_at
    `,
  );
}

/**
 * listTaskTimeLogs — the CALLER's OWN time logged on this task. time_logs RLS
 * (migrations/0010) lets a developer SELECT only WHERE user_id = fn_me(); admin/
 * finance see all. PMs have NO direct SELECT on time_logs (they read aggregate
 * hours via rollup views) → this returns zero rows for a PM, which is correct:
 * the right-rail "Time logged" card surfaces only the viewer's own effort. We
 * additionally scope to the caller so admins also see their own line here, never
 * other people's raw rows on the task detail.
 */
export async function listTaskTimeLogs(id: string) {
  const uid = await requireUid();
  const taskId = uuidSchema.parse(id);
  return asUser(
    uid,
    sql`
      SELECT tl.id, tl.user_id, u.full_name AS user_name,
             tl.minutes, tl.logged_for_date, tl.note
      FROM time_logs tl
      LEFT JOIN users u ON u.id = tl.user_id
      WHERE tl.task_id = ${taskId}::uuid
        AND tl.user_id = ${uid}::uuid
        AND tl.archived_at IS NULL
      ORDER BY tl.logged_for_date DESC, tl.created_at DESC
    `,
  );
}

// ---------------------------------------------------------------------------
// Time-log ENTRY (cross-cutting step 1) — own-effort writes on the task cockpit.
//   time_logs_insert (0010): admin/pm OR (developer AND user_id = fn_me()).
//   time_logs_update (0010): admin OR (developer AND user_id = fn_me()).
// user_id is PINNED to fn_me() server-side (never client-supplied); source =
// 'manual'; project_id / milestone_id are left for fn_cache_spine_pointers.
// NOTE: a PM/finance/sales caller cannot use these — INSERT … RETURNING enforces
// the SELECT policy as a check-option and those roles lack one, so the statement
// ERRORS (not empty). The UI renders the form ONLY for admin + developer (the
// roles that can read their own row back); this layer follows the policy as the
// source of truth and surfaces a "not permitted" error otherwise.
// ---------------------------------------------------------------------------
const logTaskTimeSchema = z
  .object({
    // Schema CHECK is only `minutes > 0` (no upper bound). App bound: 1..1440
    // (≤ 24h) — a single day's log can't exceed a day; bounds fat-finger entries.
    minutes: z.number().int().positive().max(1440),
    // Default = today. Any PAST date is allowed (back-filling prior days' work is
    // legitimate — the seed itself logs across last month); FUTURE dates rejected
    // (you can't log time for work that hasn't happened yet).
    logged_for_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
      .nullish(),
  })
  .strict();

export type LogTaskTimeInput = z.infer<typeof logTaskTimeSchema>;

export async function logTaskTime(taskId: string, input: LogTaskTimeInput) {
  const uid = await requireUid();
  const tId = uuidSchema.parse(taskId);
  const data = logTaskTimeSchema.parse(input);

  if (
    data.logged_for_date &&
    data.logged_for_date > new Date().toISOString().slice(0, 10)
  ) {
    throw new Error('logged_for_date cannot be in the future');
  }

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO time_logs (task_id, user_id, minutes, logged_for_date, source)
      VALUES (
        ${tId}::uuid,
        ${uid}::uuid,
        ${data.minutes},
        COALESCE(${data.logged_for_date ?? null}::date, CURRENT_DATE),
        'manual'::time_log_source
      )
      RETURNING id, task_id, user_id, minutes, logged_for_date
    `,
  );
  if (rows.length === 0) {
    throw new Error('Log time not permitted');
  }
  return rows[0];
}

export async function archiveTaskTimeLog(logId: string) {
  const uid = await requireUid();
  const id = uuidSchema.parse(logId);

  // Soft archive (archive-only discipline) of the caller's OWN log. RLS
  // time_logs_update gates this: admin OR (developer AND user_id = fn_me()).
  const rows = await asUser(
    uid,
    sql`
      UPDATE time_logs
      SET archived_at = now()
      WHERE id = ${id}::uuid AND archived_at IS NULL
      RETURNING id
    `,
  );
  if (rows.length === 0) {
    throw new Error('Archive time log not permitted');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// INTERNAL DISCUSSION (conversation_entries, parent_type='task'). The task
// discussion is an INTERNAL team thread — not a client channel — recorded over
// the 'slack' channel (the team's real internal medium; conversation_channel has
// no synthetic 'internal' member). direction='outbound', sender = the caller.
// Reads reuse the universal listConversation('task', id).
// ---------------------------------------------------------------------------

const taskMessageSchema = z.object({ body: z.string().min(1).max(20000) }).strict();

export async function sendTaskMessage(taskId: string, body: string) {
  const uid = await requireUid();
  const tId = uuidSchema.parse(taskId);
  const data = taskMessageSchema.parse({ body });

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO conversation_entries
        (parent_type, parent_id, channel, direction, sender_user_id, body, occurred_at)
      VALUES (
        'task'::entity_type,
        ${tId}::uuid,
        'slack'::conversation_channel,
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
  return { recorded: true, entry: rows[0] };
}
