'use server';

// lib/actions/companies.ts — Companies data-layer server actions.
//
// Rules enforced here (CLAUDE.md):
//   - Every DB call goes through asUser(uid, ...) so RLS authorizes it.
//   - NO DELETE on the companies entity — "delete" = archiveCompany (sets archived_at).
//   - No stored derived values: rollups are READ from v_company_rollup, never written.
//   - Field-level auto-save: updateCompanyField PATCHes ONE allowlisted column.
//   - Ownership is a SINGLE FK (account_owner_id) — companies have NO owner join
//     table (the one structural difference from Contacts). So owner is just a
//     field PATCH, not an add/remove membership action.
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
// display_id is trigger-assigned (CO-) and is NOT editable.
// ---------------------------------------------------------------------------
const EDITABLE_FIELDS = [
  'name',
  'website',
  'industry',
  'company_size',
  'city',
  'state',
  'country',
  'type',
  'account_owner_id',
  'about',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
const EDITABLE_SET = new Set<string>(EDITABLE_FIELDS);

// Map each editable field to a tagged-template UPDATE. We cannot interpolate a
// column NAME via a SQL parameter (only values are parameterized), so we keep a
// static map of full statements — every column name is a hard-coded literal,
// never user-controlled. The VALUE is always parameterized (injection-safe).
function buildUpdate(field: EditableField, id: string, value: unknown) {
  switch (field) {
    case 'name':
      return sql`UPDATE companies SET name = ${value as string}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'website':
      return sql`UPDATE companies SET website = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'industry':
      return sql`UPDATE companies SET industry = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'company_size':
      return sql`UPDATE companies SET company_size = ${value as string | null}::company_size, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'city':
      return sql`UPDATE companies SET city = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'state':
      return sql`UPDATE companies SET state = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'country':
      return sql`UPDATE companies SET country = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'type':
      return sql`UPDATE companies SET type = ${value as string | null}::company_type, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'account_owner_id':
      return sql`UPDATE companies SET account_owner_id = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'about':
      return sql`UPDATE companies SET about = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
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
    type: z.string().min(1).optional(),
    account_owner_id: z.string().uuid().optional(),
    search: z.string().min(1).max(200).optional(),
  })
  .strict()
  .optional();

export type CompanyListFilters = z.infer<typeof listFiltersSchema>;

const createCompanySchema = z
  .object({
    name: z.string().min(1).max(300),
    website: z.string().max(500).nullish(),
    industry: z.string().max(200).nullish(),
    type: z.string().min(1).nullish(),
    account_owner_id: z.string().uuid().nullish(),
  })
  .strict();

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

/**
 * listCompanies — non-archived companies from v_company_rollup (the view already
 * filters archived_at IS NULL). RLS restricts rows per role. Optional filters.
 */
export async function listCompanies(filters?: CompanyListFilters) {
  const uid = await requireUid();
  const f = listFiltersSchema.parse(filters) ?? {};

  // Build with all filters as parameters; NULL params no-op via the `IS NULL OR`
  // pattern so we keep a single static statement (injection-safe).
  const type = f.type ?? null;
  const ownerId = f.account_owner_id ?? null;
  const search = f.search ? `%${f.search}%` : null;

  const query = sql`
    SELECT *
    FROM v_company_rollup
    WHERE (${type}::text IS NULL OR type::text = ${type})
      AND (${ownerId}::uuid IS NULL OR account_owner_id = ${ownerId}::uuid)
      AND (
        ${search}::text IS NULL
        OR name ILIKE ${search}
        OR website ILIKE ${search}
      )
    ORDER BY name
    LIMIT 500
  `;
  return asUser(uid, query);
}

/**
 * getCompany — one company (rollup). One read through asUser so RLS applies.
 * Returns null when not found OR RLS-denied (indistinguishable, by design).
 */
export async function getCompany(id: string) {
  const uid = await requireUid();
  const companyId = uuidSchema.parse(id);

  const rows = await asUser(
    uid,
    sql`SELECT * FROM v_company_rollup WHERE id = ${companyId}::uuid`,
  );

  const company = rows[0] ?? null;
  if (!company) return null; // not found OR RLS-denied (indistinguishable, by design)
  return { company };
}

// ---------------------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------------------

/**
 * createCompany — INSERT. name required. display_id is assigned by the
 * fn_assign_display_id trigger (do NOT set it).
 */
export async function createCompany(input: CreateCompanyInput) {
  const uid = await requireUid();
  const data = createCompanySchema.parse(input);

  const query = sql`
    INSERT INTO companies (name, website, industry, type, account_owner_id)
    VALUES (
      ${data.name},
      ${data.website ?? null},
      ${data.industry ?? null},
      ${data.type ?? null}::company_type,
      ${data.account_owner_id ?? null}
    )
    RETURNING *
  `;
  const rows = await asUser(uid, query);
  return rows[0];
}

/**
 * updateCompanyField — single-column PATCH. `field` MUST be in the allowlist;
 * any other field is rejected before the DB is touched. One UPDATE. RLS gates it.
 */
export async function updateCompanyField(
  id: string,
  field: string,
  value: unknown,
) {
  const uid = await requireUid();
  const companyId = uuidSchema.parse(id);

  if (!EDITABLE_SET.has(field)) {
    throw new Error(`Field not editable: ${field}`);
  }

  const rows = await asUser(
    uid,
    buildUpdate(field as EditableField, companyId, value),
  );
  if (rows.length === 0) {
    // Zero rows = RLS denied the write or the id doesn't exist.
    throw new Error('Update not permitted or company not found');
  }
  return rows[0];
}

/**
 * archiveCompany — the "delete" action. Sets archived_at. NEVER a DELETE.
 */
export async function archiveCompany(id: string) {
  const uid = await requireUid();
  const companyId = uuidSchema.parse(id);

  const rows = await asUser(
    uid,
    sql`
      UPDATE companies
      SET archived_at = now(), updated_at = now()
      WHERE id = ${companyId}::uuid AND archived_at IS NULL
      RETURNING id, archived_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Archive not permitted or company not found');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// RELATED-ENTITY READS (for the detail cockpit). All via asUser so RLS gates
// each table; all filter archived_at IS NULL. Developers are walled from
// companies (getCompany returns null → notFound), so these only ever run for
// admin/pm/sales/finance who reached the page in the first place.
//
// Companies have NO own contact_id on projects/deals/tasks; the org→work link
// runs THROUGH the company's contacts (contacts.company_id). So every related
// read joins the entity to contacts and filters contacts.company_id = $id.
// ---------------------------------------------------------------------------

/**
 * listCompanyContacts — the People panel. Every contact whose company_id points
 * at this company, with the columns the panel renders (role/job_title, portal
 * indicator, user-status dot). RLS (contacts_select) gates each row.
 */
export async function listCompanyContacts(companyId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(companyId);
  return asUser(
    uid,
    sql`
      SELECT c.id, c.display_id, c.full_name, c.status::text AS status,
             c.is_client_portal_enabled
      FROM contacts c
      WHERE c.company_id = ${cId}::uuid AND c.archived_at IS NULL
      ORDER BY c.full_name
      LIMIT 100
    `,
  );
}

/** listCompanyProjects — projects for the company's contacts. */
export async function listCompanyProjects(companyId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(companyId);
  return asUser(
    uid,
    sql`
      SELECT pr.id, pr.display_id, pr.name, pr.status::text AS status,
             fn_project_pct(pr.id) AS completion_pct
      FROM projects pr
      JOIN contacts ct ON ct.id = pr.contact_id
      WHERE ct.company_id = ${cId}::uuid AND pr.archived_at IS NULL
      ORDER BY pr.created_at DESC
      LIMIT 8
    `,
  );
}

/** listCompanyDeals — deals for the company's contacts. */
export async function listCompanyDeals(companyId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(companyId);
  return asUser(
    uid,
    sql`
      SELECT d.id, d.display_id, d.name, d.stage::text AS stage,
             d.deal_value, d.currency
      FROM deals d
      JOIN contacts ct ON ct.id = d.contact_id
      WHERE ct.company_id = ${cId}::uuid AND d.archived_at IS NULL
      ORDER BY d.created_at DESC
      LIMIT 8
    `,
  );
}

/** listCompanyTasks — active (not done/lost) tasks for the company's contacts. */
export async function listCompanyTasks(companyId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(companyId);
  return asUser(
    uid,
    sql`
      SELECT t.id, t.display_id, t.title, t.status::text AS status, t.plan_due_date
      FROM tasks t
      JOIN contacts ct ON ct.id = t.contact_id
      WHERE ct.company_id = ${cId}::uuid
        AND t.status NOT IN ('done', 'lost')
        AND t.archived_at IS NULL
      ORDER BY t.plan_due_date NULLS LAST
      LIMIT 8
    `,
  );
}

/**
 * listCompanyCredentials — credential METADATA ONLY (id, label, login_url,
 * username). NEVER selects secret_ref. Read via credential_links with
 * parent_type='company'. RLS (credentials_select) gates it.
 */
export async function listCompanyCredentials(companyId: string) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(companyId);
  return asUser(
    uid,
    sql`
      SELECT c.id, c.label, c.login_url, c.username
      FROM credential_links cl
      JOIN credentials c ON c.id = cl.credential_id
      WHERE cl.parent_type = 'company'::entity_type
        AND cl.parent_id = ${cId}::uuid
        AND c.archived_at IS NULL
      ORDER BY c.label
      LIMIT 50
    `,
  );
}

/**
 * revealCompanyCredential — Phase-1 STUB mirroring contacts.revealCredential.
 * Records reveal INTENT in credential_access_log (always logged). Does NOT
 * decrypt or return any secret. RLS authorizes the row via credentials_select.
 */
export async function revealCompanyCredential(credentialId: string) {
  const uid = await requireUid();
  const credId = uuidSchema.parse(credentialId);

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
  return { logged: true, accessLog: rows[0] };
}

// ---------------------------------------------------------------------------
// CONVERSATION SEND (record-only stub). Inserts an OUTBOUND conversation_entry
// with parent_type='company'. It does NOT deliver to the external channel —
// delivery is the n8n sync layer's job (Phase 2). Mirrors contacts.sendMessage.
// ---------------------------------------------------------------------------
const sendMessageSchema = z
  .object({
    channel: z.string().min(1).max(40),
    body: z.string().min(1).max(20000),
  })
  .strict();

export type SendCompanyMessageInput = z.infer<typeof sendMessageSchema>;

export async function sendCompanyMessage(
  companyId: string,
  input: SendCompanyMessageInput,
) {
  const uid = await requireUid();
  const cId = uuidSchema.parse(companyId);
  const data = sendMessageSchema.parse(input);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO conversation_entries
        (parent_type, parent_id, channel, direction, sender_user_id, body, occurred_at)
      VALUES (
        'company'::entity_type,
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
  return { recorded: true, entry: rows[0] };
}
