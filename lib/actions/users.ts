'use server';

// lib/actions/users.ts — Users (team directory) data-layer server actions.
//
// DIFFERENT SHAPE FROM THE OTHER ENTITIES:
//   - EVERYONE reads the full directory (users_select USING(true) — no dev-wall).
//   - A user edits their OWN row (RLS users_update USING/​WITH CHECK admin OR
//     id=fn_me()), but ONLY across the self-editable allowlist.
//   - role / status are ADMIN-ONLY. The UI gates them, but the HARD backstop is
//     the fn_prevent_role_escalation BEFORE-UPDATE trigger (0010): a non-admin
//     changing role/status RAISES — even on their own row. updateUserRole /
//     updateUserStatus attempt the change via asUser and CATCH that exception so
//     the UI can show a refusal rather than crash. THIS is the keystone.
//   - Create = admin only (RLS users_insert WITH CHECK fn_is_admin()).
//   - archive = archived_at (admin; = revoke access). NEVER a DELETE (CLAUDE.md 4).
//   - No stored derived values: stats are READ from v_user_rollup, never written.
//   - Edge-safe: only the Neon serverless driver + zod.

import { z } from 'zod';

import { asUser, sqlNoUser } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth';

// sqlNoUser is used ONLY as the tagged-template query BUILDER; every query is
// executed via asUser so RLS always applies.
const sql = sqlNoUser;

// ---------------------------------------------------------------------------
// Session guard
// ---------------------------------------------------------------------------
async function requireUid(): Promise<string> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

// ---------------------------------------------------------------------------
// Self-editable allowlist (field-level auto-save). ANY user may edit these on
// their OWN row (RLS gates the row; this set gates the column). role + status
// are DELIBERATELY ABSENT — they are admin-only and go through their dedicated
// trigger-backstopped actions below.
// ---------------------------------------------------------------------------
const EDITABLE_FIELDS = [
  'full_name',
  'phone',
  'whatsapp',
  'teams_id',
  'team_logger_id',
  'job_title',
  'shift_start',
  'shift_end',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
const EDITABLE_SET = new Set<string>(EDITABLE_FIELDS);

// Map each editable field to a tagged-template UPDATE. A column NAME cannot be a
// SQL parameter (only values are parameterized), so we keep a static map of full
// statements — every column name is a hard-coded literal, never user-controlled.
// The VALUE is always parameterized (injection-safe).
function buildUpdate(field: EditableField, id: string, value: unknown) {
  switch (field) {
    case 'full_name':
      return sql`UPDATE users SET full_name = ${value as string}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'phone':
      return sql`UPDATE users SET phone = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'whatsapp':
      return sql`UPDATE users SET whatsapp = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'teams_id':
      return sql`UPDATE users SET teams_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'team_logger_id':
      return sql`UPDATE users SET team_logger_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'job_title':
      return sql`UPDATE users SET job_title = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'shift_start':
      return sql`UPDATE users SET shift_start = ${value as string | null}::time, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'shift_end':
      return sql`UPDATE users SET shift_end = ${value as string | null}::time, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    default: {
      // Exhaustiveness guard: a new editable field added without a branch.
      const _never: never = field;
      throw new Error(`Unhandled editable field: ${String(_never)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const uuidSchema = z.string().uuid();

const ROLE_VALUES = [
  'admin',
  'pm',
  'developer',
  'sales',
  'finance',
  'viewer',
] as const;
const STATUS_VALUES = ['active', 'away', 'left_org'] as const;
const roleSchema = z.enum(ROLE_VALUES);
const statusSchema = z.enum(STATUS_VALUES);

// Filters are tolerant: an unknown role/status from the URL is dropped (→ no
// filter) rather than throwing, so a hand-typed bad query param can't 500 the
// page. search is a free-text ILIKE.
const listFiltersSchema = z
  .object({
    role: z.enum(ROLE_VALUES).optional().catch(undefined),
    status: z.enum(STATUS_VALUES).optional().catch(undefined),
    search: z.string().min(1).max(200).optional().catch(undefined),
  })
  .optional();

// Loose public input — the page passes raw searchParam strings; the schema
// validates/narrows at runtime (an unknown role/status throws, as intended).
export type UserListFilters = {
  role?: string;
  status?: string;
  search?: string;
};

const createUserSchema = z
  .object({
    full_name: z.string().min(1).max(300),
    email: z.string().email().max(300),
    role: z.enum(ROLE_VALUES),
  })
  .strict();

// Loose public input — the dialog passes a raw role string; createUserSchema
// validates/narrows it (an unknown role throws → surfaced as a refusal).
export type CreateUserInput = {
  full_name: string;
  email: string;
  role: string;
};

// The shape an action returns when a write is REFUSED rather than throwing — so
// the UI can render the refusal inline (used for the trigger-blocked role/status
// changes by a non-admin: the keystone).
export type WriteResult<T> =
  | { ok: true; row: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// READS — everyone sees the full directory (users_select USING(true)).
// ---------------------------------------------------------------------------

/**
 * listUsers — directory rows from v_user_rollup (stats included). The view
 * already filters archived_at IS NULL. Optional role/status/search filters.
 * RLS allows every authenticated role to read every row (intended — no dev-wall).
 */
export async function listUsers(filters?: UserListFilters) {
  const uid = await requireUid();
  const f = listFiltersSchema.parse(filters) ?? {};

  const role = f.role ?? null;
  const status = f.status ?? null;
  const search = f.search ? `%${f.search}%` : null;

  const query = sql`
    SELECT *
    FROM v_user_rollup
    WHERE (${role}::text IS NULL OR role::text = ${role})
      AND (${status}::text IS NULL OR status::text = ${status})
      AND (
        ${search}::text IS NULL
        OR full_name ILIKE ${search}
        OR email ILIKE ${search}
        OR job_title ILIKE ${search}
      )
    ORDER BY full_name
    LIMIT 500
  `;
  return asUser(uid, query);
}

/**
 * getUser — one user (rollup). Readable by everyone (directory is world-readable
 * to authed roles). Returns null if the id doesn't exist.
 */
export async function getUser(id: string) {
  const uid = await requireUid();
  const userId = uuidSchema.parse(id);

  const rows = await asUser(
    uid,
    sql`SELECT * FROM v_user_rollup WHERE id = ${userId}::uuid`,
  );
  return rows[0] ?? null;
}

/**
 * listUserAvailability — the next-3-days availability window for a user (the
 * "3-day availability" card on the detail cockpit). One row per (user, date)
 * from user_availability; we read today + the next two days and let the UI fill
 * missing days as "open". RLS gates the read (directory is world-readable).
 *
 * `date` comes back from the neon driver as a Date OBJECT and `available_hours`
 * as a numeric string — the UI coerces both; we never render a raw Date child.
 */
export async function listUserAvailability(id: string) {
  const uid = await requireUid();
  const userId = uuidSchema.parse(id);

  return asUser(
    uid,
    sql`
      SELECT date, available_hours
      FROM user_availability
      WHERE user_id = ${userId}::uuid
        AND date >= CURRENT_DATE
        AND date < CURRENT_DATE + 3
      ORDER BY date
    `,
  );
}

/**
 * listUserWorkload — the projects a user is a member of, plus the open tasks
 * assigned to them (the "Working on" + "Assigned tasks" workload tree). Two
 * reads through asUser so RLS applies to each table independently.
 *   - projects: via project_members (their membership role per project).
 *   - tasks: via task_assignees, open tasks only (status NOT IN done/lost).
 * plan_due_date is a `date` (Date object from neon) — formatted by the UI.
 */
export async function listUserWorkload(id: string) {
  const uid = await requireUid();
  const userId = uuidSchema.parse(id);

  const [projects, tasks] = await Promise.all([
    asUser(
      uid,
      sql`
        SELECT p.id, p.display_id, p.name, p.status, pm.role AS member_role,
               (
                 SELECT COUNT(*) FROM task_assignees ta2
                 JOIN tasks t2 ON t2.id = ta2.task_id
                 WHERE ta2.user_id = ${userId}::uuid
                   AND t2.project_id = p.id
                   AND t2.status NOT IN ('done','lost')
                   AND t2.archived_at IS NULL
               ) AS task_count
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = ${userId}::uuid
          AND p.archived_at IS NULL
        ORDER BY p.name
      `,
    ),
    asUser(
      uid,
      sql`
        SELECT t.id, t.display_id, t.title, t.status, t.plan_due_date,
               t.project_id, p.name AS project_name
        FROM task_assignees ta
        JOIN tasks t ON t.id = ta.task_id
        LEFT JOIN projects p ON p.id = t.project_id
        WHERE ta.user_id = ${userId}::uuid
          AND t.status NOT IN ('done','lost')
          AND t.archived_at IS NULL
        ORDER BY t.plan_due_date NULLS LAST, t.created_at
        LIMIT 50
      `,
    ),
  ]);

  return { projects, tasks };
}

/**
 * listUserExpertise — the user's tech expertise (the "Tech expertise" card),
 * read from app_links where parent_type='user'. proficiency is only meaningful
 * for users (expert | intermediate). Joined to apps for the display name.
 */
export async function listUserExpertise(id: string) {
  const uid = await requireUid();
  const userId = uuidSchema.parse(id);

  return asUser(
    uid,
    sql`
      SELECT al.id, al.proficiency, a.name AS app_name, a.category
      FROM app_links al
      JOIN apps a ON a.id = al.app_id
      WHERE al.parent_type = 'user'::entity_type
        AND al.parent_id = ${userId}::uuid
        AND al.archived_at IS NULL
        AND a.archived_at IS NULL
      ORDER BY
        CASE al.proficiency WHEN 'expert' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END,
        a.name
    `,
  );
}

// ---------------------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------------------

/**
 * createUser — INSERT a new staff member (admin only; RLS users_insert WITH
 * CHECK fn_is_admin()). display_id (U-) is assigned by fn_assign_display_id —
 * do NOT set it. Provisioning the row is what enables their invite-only login.
 * A non-admin's INSERT is denied by RLS → zero rows → we surface a refusal.
 */
export async function createUser(
  input: CreateUserInput,
): Promise<WriteResult<Record<string, unknown>>> {
  const uid = await requireUid();

  try {
    const data = createUserSchema.parse(input);
    const rows = await asUser(
      uid,
      sql`
        INSERT INTO users (full_name, email, role, status)
        VALUES (
          ${data.full_name},
          ${data.email},
          ${data.role}::user_role,
          'active'::user_status
        )
        RETURNING *
      `,
    );
    if (rows.length === 0) {
      return { ok: false, error: 'Not permitted: only an admin can create users.' };
    }
    return { ok: true, row: rows[0] };
  } catch (e) {
    // Unique-email collision or RLS denial surface here.
    return { ok: false, error: messageFor(e) };
  }
}

/**
 * updateUserField — single-column PATCH across the SELF-EDITABLE allowlist.
 * `field` MUST be in EDITABLE_FIELDS (role/status are NOT — they have their own
 * trigger-backstopped actions). RLS gates the ROW (admin OR own row). One UPDATE.
 */
export async function updateUserField(id: string, field: string, value: unknown) {
  const uid = await requireUid();
  const userId = uuidSchema.parse(id);

  if (!EDITABLE_SET.has(field)) {
    throw new Error(`Field not editable: ${field}`);
  }

  const rows = await asUser(
    uid,
    buildUpdate(field as EditableField, userId, value),
  );
  if (rows.length === 0) {
    // Zero rows = RLS denied the write (not own row, not admin) or id absent.
    throw new Error('Update not permitted or user not found');
  }
  return rows[0];
}

/**
 * 🚨 updateUserRole — THE NEGATIVE KEYSTONE on the write path.
 *
 * Attempts the role change via asUser. RLS (users_update) lets a user UPDATE
 * their own row, so the statement is NOT blocked at the row level — it reaches
 * the fn_prevent_role_escalation BEFORE-UPDATE trigger, which RAISES for any
 * non-admin changing role/status. We CATCH that exception and return a structured
 * refusal so the UI can show it. An admin's change succeeds and returns the row.
 *
 * This is the load-bearing assertion of the permission model: a non-admin cannot
 * change a role even on a row RLS lets them write. The authoritative DB-layer
 * assertion lives in scripts/verify-rls.sql; this action makes the same property
 * observable through the app.
 */
export async function updateUserRole(
  id: string,
  role: string,
): Promise<WriteResult<Record<string, unknown>>> {
  const uid = await requireUid();
  const userId = uuidSchema.parse(id);
  const nextRole = roleSchema.parse(role);

  try {
    const rows = await asUser(
      uid,
      sql`
        UPDATE users
        SET role = ${nextRole}::user_role, updated_at = now()
        WHERE id = ${userId}::uuid
        RETURNING id, role, status
      `,
    );
    if (rows.length === 0) {
      // RLS denied the row entirely (e.g. editing someone else's row as non-admin).
      return { ok: false, error: 'Not permitted: only an admin can change a role.' };
    }
    return { ok: true, row: rows[0] };
  } catch (e) {
    // fn_prevent_role_escalation RAISEd → non-admin role change blocked.
    return {
      ok: false,
      error: refusalText(e, 'Only an admin can change a role.'),
    };
  }
}

/**
 * 🚨 updateUserStatus — same keystone as updateUserRole, for status
 * (active|away|left_org). Non-admin status change → trigger RAISEs → caught →
 * structured refusal. Admin succeeds. (status='left_org' is an access-revoke
 * signal; the AUTHORITATIVE revoke is archiveUser — RLS-enforced.)
 */
export async function updateUserStatus(
  id: string,
  status: string,
): Promise<WriteResult<Record<string, unknown>>> {
  const uid = await requireUid();
  const userId = uuidSchema.parse(id);
  const nextStatus = statusSchema.parse(status);

  try {
    const rows = await asUser(
      uid,
      sql`
        UPDATE users
        SET status = ${nextStatus}::user_status, updated_at = now()
        WHERE id = ${userId}::uuid
        RETURNING id, role, status
      `,
    );
    if (rows.length === 0) {
      return { ok: false, error: 'Not permitted: only an admin can change status.' };
    }
    return { ok: true, row: rows[0] };
  } catch (e) {
    return {
      ok: false,
      error: refusalText(e, 'Only an admin can change status.'),
    };
  }
}

/**
 * archiveUser — the "delete" action and the AUTHORITATIVE access revoke (admin).
 * Sets archived_at; NEVER a DELETE. The instant a user is archived, fn_my_role()
 * resolves to NULL for them on the next request → RLS denies all data (the
 * archive-kills-access path). RLS users_update lets admin write any row; a
 * non-admin archiving anyone but themselves is denied (zero rows → refusal).
 */
export async function archiveUser(
  id: string,
): Promise<WriteResult<{ id: string; archived_at: unknown }>> {
  const uid = await requireUid();
  const userId = uuidSchema.parse(id);

  try {
    const rows = await asUser<{ id: string; archived_at: unknown }>(
      uid,
      sql`
        UPDATE users
        SET archived_at = now(), updated_at = now()
        WHERE id = ${userId}::uuid AND archived_at IS NULL
        RETURNING id, archived_at
      `,
    );
    if (rows.length === 0) {
      return {
        ok: false,
        error: 'Not permitted: only an admin can archive a user (or already archived).',
      };
    }
    return { ok: true, row: rows[0] };
  } catch (e) {
    return { ok: false, error: messageFor(e) };
  }
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------
function messageFor(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Operation failed.';
}

/**
 * refusalText — for the trigger-blocked role/status path, prefer a clean,
 * user-facing message over leaking the raw Postgres RAISE text, but keep the
 * raw message available behind a generic fallback for any unexpected error.
 */
function refusalText(e: unknown, friendly: string): string {
  const raw = e instanceof Error ? e.message : '';
  // fn_prevent_role_escalation RAISEs 'Only admin may change user role or status'.
  if (/admin may change user role or status/i.test(raw)) return friendly;
  return raw || friendly;
}
