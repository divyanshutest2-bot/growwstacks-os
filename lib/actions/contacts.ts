'use server';

// lib/actions/contacts.ts — Contacts data-layer server actions.
//
// Rules enforced here (CLAUDE.md):
//   - Every DB call goes through asUser(uid, ...) so RLS authorizes it.
//   - NO DELETE on the contacts entity — "delete" = archiveContact (sets archived_at).
//     (Join tables contact_owners / contact_lead_sources ARE the documented DELETE
//      exception: membership removal is a legitimate state change.)
//   - No stored derived values: rollups are READ from v_contact_rollup, never written.
//   - Field-level auto-save: updateContactField PATCHes ONE allowlisted column.
//   - Ownership is the join table (contact_owners); primary_owner_id is a cache pointer.
//   - Edge-safe: only the Neon serverless driver + zod.

import { z } from 'zod';

import { asUser } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth';
import { sqlNoUser } from '@/lib/db';

// sqlNoUser is imported only to access the tagged-template fn for building
// queries; the queries themselves are executed exclusively via asUser, so RLS
// always applies. (Neon's `sql` is both an executor and a query builder; we use
// it here purely as the builder and hand the query to asUser.)
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
// Editable-column allowlist (field-level auto-save). Any field NOT in this set
// is rejected before touching the DB. RLS still independently authorizes the row.
// ---------------------------------------------------------------------------
const EDITABLE_FIELDS = [
  'full_name',
  'email',
  'phone',
  'whatsapp',
  'slack_id',
  'teams_channel',
  'teams_channel_id',
  'country',
  'city',
  'state',
  'main_platform',
  'status',
  'rating',
  'primary_owner_id',
  'company_id',
  'about',
  'is_client_portal_enabled',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
const EDITABLE_SET = new Set<string>(EDITABLE_FIELDS);

// Map each editable field to a tagged-template UPDATE. We cannot interpolate a
// column NAME via a SQL parameter (only values are parameterized), so we keep a
// static map of full statements — every column name is a hard-coded literal,
// never user-controlled. The VALUE is always parameterized (injection-safe).
function buildUpdate(field: EditableField, id: string, value: unknown) {
  switch (field) {
    case 'full_name':
      return sql`UPDATE contacts SET full_name = ${value as string}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'email':
      return sql`UPDATE contacts SET email = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'phone':
      return sql`UPDATE contacts SET phone = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'whatsapp':
      return sql`UPDATE contacts SET whatsapp = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'slack_id':
      return sql`UPDATE contacts SET slack_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'teams_channel':
      return sql`UPDATE contacts SET teams_channel = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'teams_channel_id':
      return sql`UPDATE contacts SET teams_channel_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'country':
      return sql`UPDATE contacts SET country = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'city':
      return sql`UPDATE contacts SET city = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'state':
      return sql`UPDATE contacts SET state = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'main_platform':
      return sql`UPDATE contacts SET main_platform = ${value as string | null} WHERE id = ${id}::uuid RETURNING *`;
    case 'status':
      return sql`UPDATE contacts SET status = ${value as string}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'rating':
      return sql`UPDATE contacts SET rating = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'primary_owner_id':
      return sql`UPDATE contacts SET primary_owner_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'company_id':
      return sql`UPDATE contacts SET company_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'about':
      return sql`UPDATE contacts SET about = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'is_client_portal_enabled':
      return sql`UPDATE contacts SET is_client_portal_enabled = ${value as boolean}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
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
    company_id: z.string().uuid().optional(),
    primary_owner_id: z.string().uuid().optional(),
    search: z.string().min(1).max(200).optional(),
  })
  .strict()
  .optional();

export type ContactListFilters = z.infer<typeof listFiltersSchema>;

const createContactSchema = z
  .object({
    full_name: z.string().min(1).max(300),
    email: z.string().email().max(300).nullish(),
    phone: z.string().max(50).nullish(),
    company_id: z.string().uuid().nullish(),
    status: z.string().min(1).nullish(),
    primary_owner_id: z.string().uuid().nullish(),
  })
  .strict();

export type CreateContactInput = z.infer<typeof createContactSchema>;

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

/**
 * listContacts — non-archived contacts from v_contact_rollup (the view already
 * filters archived_at IS NULL). RLS restricts rows per role. Optional filters.
 */
export async function listContacts(filters?: ContactListFilters) {
  const uid = await requireUid();
  const f = listFiltersSchema.parse(filters) ?? {};

  // Build with all filters as parameters; NULL params no-op via the `IS NULL OR`
  // pattern so we keep a single static statement (injection-safe).
  const status = f.status ?? null;
  const companyId = f.company_id ?? null;
  const ownerId = f.primary_owner_id ?? null;
  const search = f.search ? `%${f.search}%` : null;

  const query = sql`
    SELECT *
    FROM v_contact_rollup
    WHERE (${status}::text IS NULL OR status::text = ${status})
      AND (${companyId}::uuid IS NULL OR company_id = ${companyId}::uuid)
      AND (${ownerId}::uuid IS NULL OR primary_owner_id = ${ownerId}::uuid)
      AND (
        ${search}::text IS NULL
        OR full_name ILIKE ${search}
        OR email ILIKE ${search}
      )
    ORDER BY full_name
    LIMIT 500
  `;
  return asUser(uid, query);
}

/**
 * getContact — one contact (rollup) plus its owners (with user names) and lead
 * sources. Three reads, each through asUser so RLS applies to each table.
 */
export async function getContact(id: string) {
  const uid = await requireUid();
  const contactId = uuidSchema.parse(id);

  const [contactRows, owners, leadSources] = await Promise.all([
    asUser(
      uid,
      // job_title lives on contacts (added in 0016), not in v_contact_rollup — join it in.
      sql`SELECT r.*, c.job_title
          FROM v_contact_rollup r
          JOIN contacts c ON c.id = r.id
          WHERE r.id = ${contactId}::uuid`,
    ),
    asUser(
      uid,
      sql`
        SELECT co.user_id, u.full_name, u.email, co.created_at
        FROM contact_owners co
        JOIN users u ON u.id = co.user_id
        WHERE co.contact_id = ${contactId}::uuid
        ORDER BY co.created_at
      `,
    ),
    asUser(
      uid,
      sql`
        SELECT lead_source, created_at
        FROM contact_lead_sources
        WHERE contact_id = ${contactId}::uuid
        ORDER BY created_at
      `,
    ),
  ]);

  const contact = contactRows[0] ?? null;
  if (!contact) return null; // not found OR RLS-denied (indistinguishable, by design)
  return { contact, owners, leadSources };
}

// ---------------------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------------------

/**
 * createContact — INSERT. full_name required. display_id is assigned by the
 * fn_assign_display_id trigger (do NOT set it). Spine caches are trigger-set.
 */
export async function createContact(input: CreateContactInput) {
  const uid = await requireUid();
  const data = createContactSchema.parse(input);

  const query = sql`
    INSERT INTO contacts (full_name, email, phone, company_id, status, primary_owner_id)
    VALUES (
      ${data.full_name},
      ${data.email ?? null},
      ${data.phone ?? null},
      ${data.company_id ?? null},
      COALESCE(${data.status ?? null}::contact_status, 'prospect'::contact_status),
      ${data.primary_owner_id ?? null}
    )
    RETURNING *
  `;
  const rows = await asUser(uid, query);
  return rows[0];
}

/**
 * updateContactField — single-column PATCH. `field` MUST be in the allowlist;
 * any other field is rejected before the DB is touched. One UPDATE. RLS gates it.
 */
export async function updateContactField(
  id: string,
  field: string,
  value: unknown,
) {
  const uid = await requireUid();
  const contactId = uuidSchema.parse(id);

  if (!EDITABLE_SET.has(field)) {
    throw new Error(`Field not editable: ${field}`);
  }

  const rows = await asUser(
    uid,
    buildUpdate(field as EditableField, contactId, value),
  );
  if (rows.length === 0) {
    // Zero rows = RLS denied the write or the id doesn't exist.
    throw new Error('Update not permitted or contact not found');
  }
  return rows[0];
}

/**
 * archiveContact — the "delete" action. Sets archived_at. NEVER a DELETE.
 */
export async function archiveContact(id: string) {
  const uid = await requireUid();
  const contactId = uuidSchema.parse(id);

  const rows = await asUser(
    uid,
    sql`
      UPDATE contacts
      SET archived_at = now(), updated_at = now()
      WHERE id = ${contactId}::uuid AND archived_at IS NULL
      RETURNING id, archived_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Archive not permitted or contact not found');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// OWNERSHIP (join table — DELETE is the documented exception)
// ---------------------------------------------------------------------------

export async function addContactOwner(contactId: string, userId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  const uId = uuidSchema.parse(userId);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO contact_owners (contact_id, user_id)
      VALUES (${cId}::uuid, ${uId}::uuid)
      ON CONFLICT (contact_id, user_id) DO NOTHING
      RETURNING id, contact_id, user_id, created_at
    `,
  );
  return rows[0] ?? null; // null if it already existed (idempotent add)
}

export async function removeContactOwner(contactId: string, userId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  const uId = uuidSchema.parse(userId);

  // Join-table membership removal — the documented DELETE exception.
  const rows = await asUser(
    uid,
    sql`
      DELETE FROM contact_owners
      WHERE contact_id = ${cId}::uuid AND user_id = ${uId}::uuid
      RETURNING id
    `,
  );
  return { removed: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// LEAD SOURCES (multi-value join table)
// ---------------------------------------------------------------------------

export async function addLeadSource(contactId: string, source: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  const src = z.string().min(1).max(100).parse(source);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO contact_lead_sources (contact_id, lead_source)
      VALUES (${cId}::uuid, ${src}::lead_source)
      ON CONFLICT (contact_id, lead_source) DO NOTHING
      RETURNING id, contact_id, lead_source, created_at
    `,
  );
  return rows[0] ?? null;
}

export async function removeLeadSource(contactId: string, source: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  const src = z.string().min(1).max(100).parse(source);

  const rows = await asUser(
    uid,
    sql`
      DELETE FROM contact_lead_sources
      WHERE contact_id = ${cId}::uuid AND lead_source = ${src}::lead_source
      RETURNING id
    `,
  );
  return { removed: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// RELATED-ENTITY READS (for the detail cockpit's right rail). All via asUser so
// RLS gates each table; all filter archived_at IS NULL. Developers are walled
// from contacts (getContact returns null → notFound), so these only ever run for
// admin/pm/sales/finance who reached the page in the first place.
// ---------------------------------------------------------------------------

/** listContactProjects — projects rolled up onto a contact (cached contact_id). */
export async function listContactProjects(contactId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  return asUser(
    uid,
    sql`
      SELECT id, display_id, name, status::text AS status
      FROM projects
      WHERE contact_id = ${cId}::uuid AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 6
    `,
  );
}

/** listContactMilestones — open (not-done) milestones for a contact. */
export async function listContactMilestones(contactId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  return asUser(
    uid,
    sql`
      SELECT id, display_id, name, status::text AS status, target_date
      FROM milestones
      WHERE contact_id = ${cId}::uuid
        AND status <> 'done'
        AND archived_at IS NULL
      ORDER BY target_date NULLS LAST
      LIMIT 6
    `,
  );
}

/** listContactTasks — active (not done/lost) tasks for a contact. */
export async function listContactTasks(contactId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  return asUser(
    uid,
    sql`
      SELECT id, display_id, title, status::text AS status, plan_due_date
      FROM tasks
      WHERE contact_id = ${cId}::uuid
        AND status NOT IN ('done', 'lost')
        AND archived_at IS NULL
      ORDER BY plan_due_date NULLS LAST
      LIMIT 6
    `,
  );
}

/** listContactDeals — deals for a contact. */
export async function listContactDeals(contactId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  return asUser(
    uid,
    sql`
      SELECT id, display_id, name, stage::text AS stage, deal_value, currency
      FROM deals
      WHERE contact_id = ${cId}::uuid AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 6
    `,
  );
}

/**
 * listContactCredentials — credential METADATA ONLY (id, label, login_url,
 * username). NEVER selects secret_ref (column-level SELECT is revoked from all
 * app roles anyway; we also never name it here). Read via credential_links so
 * the polymorphic attach semantics hold. RLS (credentials_select) gates it.
 */
export async function listContactCredentials(contactId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  return asUser(
    uid,
    sql`
      SELECT c.id, c.label, c.login_url, c.username
      FROM credential_links cl
      JOIN credentials c ON c.id = cl.credential_id
      WHERE cl.parent_type = 'contact'::entity_type
        AND cl.parent_id = ${cId}::uuid
        AND c.archived_at IS NULL
      ORDER BY c.label
      LIMIT 50
    `,
  );
}

/**
 * revealCredential — Phase-1 STUB. Records reveal INTENT in credential_access_log
 * (every reveal is logged, always — migration 0005). The full pgcrypto decrypt of
 * secret_ref runs in the service-role reveal path (Phase 2); this action does NOT
 * decrypt or return any secret. It writes the access-log row and returns it so the
 * UI can confirm "access logged". RLS authorizes the row via credentials_select.
 */
export async function revealCredential(credentialId: string) {
  const uid = await requireUid();
  const credId = uuidSchema.parse(credentialId);

  // Independent audit: log the access attempt before any (future) decrypt.
  const rows = await asUser(
    uid,
    sql`
      INSERT INTO credential_access_log (credential_id, user_id)
      SELECT ${credId}::uuid, ${uid}::uuid
      WHERE EXISTS (SELECT 1 FROM credentials WHERE id = ${credId}::uuid)
      RETURNING id, credential_id, accessed_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Reveal not permitted or credential not found');
  }
  // Phase-1: secret is intentionally NOT returned (no plaintext over the wire).
  return { logged: true, accessLog: rows[0] };
}

// ---------------------------------------------------------------------------
// CONVERSATION SEND (record-only stub). Inserts an OUTBOUND conversation_entry
// authored by the caller. It does NOT deliver to the external channel — delivery
// is the n8n sync layer's job (Phase 2). This keeps the composer from crashing and
// records intent honestly without faking delivery.
// ---------------------------------------------------------------------------
const sendMessageSchema = z
  .object({
    channel: z.string().min(1).max(40),
    body: z.string().min(1).max(20000),
  })
  .strict();

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export async function sendMessage(contactId: string, input: SendMessageInput) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(contactId);
  const data = sendMessageSchema.parse(input);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO conversation_entries
        (parent_type, parent_id, channel, direction, sender_user_id, body, occurred_at)
      VALUES (
        'contact'::entity_type,
        ${cId}::uuid,
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
