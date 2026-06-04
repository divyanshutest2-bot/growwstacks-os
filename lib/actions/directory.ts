'use server';

// lib/actions/directory.ts — small read-only lookups for pickers (owner select,
// company select, lead-source list). All via asUser so RLS gates them; the
// users directory is world-readable to authed roles (users_select USING(true)),
// companies are RLS-gated per role.

import { asUser, sqlNoUser } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth';

const sql = sqlNoUser;

async function requireUid(): Promise<string> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

export type UserOption = { id: string; full_name: string | null; email: string | null };
export type CompanyOption = { id: string; name: string };

/** listActiveUsers — for owner pickers. Non-archived, non-left_org. */
export async function listActiveUsers(): Promise<UserOption[]> {
  const uid = await requireUid();
  return asUser<UserOption>(
    uid,
    sql`
      SELECT id, full_name, email
      FROM users
      WHERE archived_at IS NULL AND status <> 'left_org'
      ORDER BY full_name
      LIMIT 500
    `,
  );
}

export type ContactOwnerRow = {
  contact_id: string;
  user_id: string;
  full_name: string | null;
  status: string | null;
};

/**
 * listOwnersForContacts — batch fetch owners for a set of contacts so the list
 * can render multi-owner avatar chips (with a user-status dot) per row without
 * N+1 reads. RLS-gated.
 */
export async function listOwnersForContacts(
  contactIds: string[],
): Promise<ContactOwnerRow[]> {
  const uid = await requireUid();
  if (contactIds.length === 0) return [];
  return asUser<ContactOwnerRow>(
    uid,
    sql`
      SELECT co.contact_id, co.user_id, u.full_name, u.status::text AS status
      FROM contact_owners co
      JOIN users u ON u.id = co.user_id
      WHERE co.contact_id = ANY(${contactIds}::uuid[])
      ORDER BY co.created_at
    `,
  );
}

export type ContactLeadSourceRow = {
  contact_id: string;
  lead_source: string;
};

/**
 * listLeadSourcesForContacts — batch fetch lead sources for the list's
 * "Lead source" column (first source + "+N"). RLS-gated, no N+1.
 */
export async function listLeadSourcesForContacts(
  contactIds: string[],
): Promise<ContactLeadSourceRow[]> {
  const uid = await requireUid();
  if (contactIds.length === 0) return [];
  return asUser<ContactLeadSourceRow>(
    uid,
    sql`
      SELECT contact_id, lead_source::text AS lead_source
      FROM contact_lead_sources
      WHERE contact_id = ANY(${contactIds}::uuid[])
      ORDER BY created_at
    `,
  );
}

export type CurrentUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

/**
 * getCurrentUser — the logged-in user's own row, for the sidebar account chip.
 * users_select is USING(true) so this reads via asUser cleanly. Returns null if
 * there is no session (callers render a placeholder).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const rows = await asUser<CurrentUser>(
    uid,
    sql`
      SELECT id, full_name, email, role::text AS role
      FROM users
      WHERE id = ${uid}::uuid
      LIMIT 1
    `,
  );
  return rows[0] ?? null;
}

/** listCompanies — for the company filter + attach picker. RLS-gated. */
export async function listCompanies(): Promise<CompanyOption[]> {
  const uid = await requireUid();
  return asUser<CompanyOption>(
    uid,
    sql`
      SELECT id, name
      FROM companies
      WHERE archived_at IS NULL
      ORDER BY name
      LIMIT 500
    `,
  );
}
