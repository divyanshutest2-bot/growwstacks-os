'use server';

// lib/actions/tests.ts — dev/UAT test recording (cross-cutting step 2).
// Polymorphic over {milestone, task}. RLS (0010) is the enforcement boundary:
//   tests_insert: fn_can_edit(parent) — milestone: admin/pm; task: admin/pm OR
//                 (developer ASSIGNED to the task).
//   tests_update: fn_can_edit(parent) OR tester_user_id = fn_me() (tester may
//                 retract their own test).
//   tests_select: fn_can_see(parent) — MEMBERSHIP-based, so a member developer
//                 can READ a project's tests even though they cannot INSERT on a
//                 milestone. tests carry NO money/client columns → role-safe for
//                 both projections.

import { z } from 'zod';

import { asUser, sqlNoUser } from '@/lib/db';
import { getCurrentUserId, getCurrentUserRole } from '@/lib/auth';

const sql = sqlNoUser;
const uuidSchema = z.string().uuid();

async function requireUid(): Promise<string> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

const createTestSchema = z
  .object({
    test_type: z.enum(['developer', 'uat']),
    title: z.string().min(1).max(300),
    // Outcome is REQUIRED here even though tests.outcome is nullable — a
    // deliberate simplification this step (record-with-result; no pending flow).
    outcome: z.enum(['pass', 'fail']),
  })
  .strict();

export type CreateTestInput = z.infer<typeof createTestSchema>;

export type ProjectTestRow = {
  id: string;
  parent_type: string;
  parent_label: string | null;
  test_type: string;
  title: string | null;
  outcome: string | null;
  tester_name: string | null;
};

export async function createTest(
  parentType: string,
  parentId: string,
  input: CreateTestInput,
) {
  const uid = await requireUid();
  if (parentType !== 'milestone' && parentType !== 'task') {
    throw new Error('A test parent must be a milestone or a task');
  }
  const pId = uuidSchema.parse(parentId);
  const data = createTestSchema.parse(input);

  // tester_role derived from the caller's role. The enum is {developer, pm} only,
  // so an admin tester records NULL (no admin value exists).
  const role = await getCurrentUserRole();
  const testerRole =
    role === 'developer' ? 'developer' : role === 'pm' ? 'pm' : null;

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO tests (
        parent_type, parent_id, test_type, title, outcome,
        tester_user_id, tester_role, conducted_at, passed_at
      )
      VALUES (
        ${parentType}::entity_type,
        ${pId}::uuid,
        ${data.test_type}::test_type,
        ${data.title},
        ${data.outcome}::test_outcome,
        ${uid}::uuid,
        ${testerRole}::tester_role_type,
        now(),
        CASE WHEN ${data.outcome === 'pass'} THEN now() ELSE NULL END
      )
      RETURNING id, parent_type, parent_id, test_type, title, outcome
    `,
  );
  if (rows.length === 0) {
    throw new Error('Record test not permitted');
  }
  return rows[0];
}

export async function archiveTest(testId: string) {
  const uid = await requireUid();
  const id = uuidSchema.parse(testId);

  const rows = await asUser(
    uid,
    sql`
      UPDATE tests SET archived_at = now()
      WHERE id = ${id}::uuid AND archived_at IS NULL
      RETURNING id
    `,
  );
  if (rows.length === 0) {
    throw new Error('Archive test not permitted');
  }
  return rows[0];
}

export async function listProjectTests(
  projectId: string,
): Promise<ProjectTestRow[]> {
  const uid = await requireUid();
  const pId = uuidSchema.parse(projectId);

  // No cached project_id on tests → join via the parents. RLS on tests
  // (fn_can_see) AND on milestones/tasks makes this role-safe automatically for
  // both projections; the parent label is delivery info (name + display_id), not
  // client identity.
  return asUser<ProjectTestRow>(
    uid,
    sql`
      SELECT
        te.id,
        te.parent_type::text AS parent_type,
        CASE te.parent_type
          WHEN 'milestone' THEN m.name || ' · ' || m.display_id
          WHEN 'task'      THEN t.title || ' · ' || t.display_id
        END AS parent_label,
        te.test_type::text AS test_type,
        te.title,
        te.outcome::text AS outcome,
        u.full_name AS tester_name
      FROM tests te
      LEFT JOIN milestones m ON te.parent_type = 'milestone' AND m.id = te.parent_id
      LEFT JOIN tasks t      ON te.parent_type = 'task'      AND t.id = te.parent_id
      LEFT JOIN users u      ON u.id = te.tester_user_id
      WHERE te.archived_at IS NULL
        AND (
          (te.parent_type = 'milestone' AND m.project_id = ${pId}::uuid)
          OR (te.parent_type = 'task'    AND t.project_id = ${pId}::uuid)
        )
      ORDER BY te.parent_type, te.created_at
    `,
  );
}
