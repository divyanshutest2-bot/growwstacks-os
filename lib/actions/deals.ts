'use server';

// lib/actions/deals.ts — Deals data-layer server actions.
//
// Mirrors lib/actions/contacts.ts exactly. Rules enforced here (CLAUDE.md):
//   - Every DB call goes through asUser(uid, ...) so RLS authorizes it.
//   - NO DELETE on the deals entity — "delete" = archiveDeal (sets archived_at).
//     (Join tables deal_owners / deal_tags ARE the documented DELETE exception:
//      membership removal is a legitimate state change.)
//   - No stored derived values: billing/rollup is READ from v_deal_rollup /
//     v_deal_billing, never written.
//   - Field-level auto-save: updateDealField PATCHes ONE allowlisted column.
//   - Ownership is the join table (deal_owners); primary_owner_id is a cache.
//   - company_id is CACHED from the contact via trigger — NEVER hand-set here.
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
//   - contact_id is set at create time (not editable; reassigning a deal's
//     contact would re-cache the whole spine — out of scope).
//   - company_id is trigger-cached from the contact — NEVER editable here.
//   - display_id is trigger-assigned — never set.
// ---------------------------------------------------------------------------
const EDITABLE_FIELDS = [
  'name',
  'payment_type',
  'deal_value',
  'currency',
  'stage',
  'close_date',
  'description',
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
      return sql`UPDATE deals SET name = ${value as string}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'payment_type':
      return sql`UPDATE deals SET payment_type = ${value as string | null}::payment_type, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'deal_value':
      return sql`UPDATE deals SET deal_value = ${value as number | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'currency':
      return sql`UPDATE deals SET currency = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'stage':
      return sql`UPDATE deals SET stage = ${value as string}::deal_stage, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'close_date':
      return sql`UPDATE deals SET close_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'description':
      return sql`UPDATE deals SET description = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
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
    stage: z.string().min(1).optional(),
    owner: z.string().uuid().optional(),
    search: z.string().min(1).max(200).optional(),
  })
  .strict()
  .optional();

export type DealListFilters = z.infer<typeof listFiltersSchema>;

const createDealSchema = z
  .object({
    name: z.string().min(1).max(300),
    contact_id: z.string().uuid(),
    payment_type: z.string().min(1).nullish(),
    deal_value: z.number().nullish(),
    currency: z.string().length(3).nullish(),
    stage: z.string().min(1).nullish(),
    close_date: z.string().min(1).nullish(),
    primary_owner_id: z.string().uuid().nullish(),
  })
  .strict();

export type CreateDealInput = z.infer<typeof createDealSchema>;

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

/**
 * listDeals — non-archived deals from v_deal_rollup (the view already filters
 * archived_at IS NULL). RLS restricts rows per role (developers see ZERO).
 * Optional filters: stage, owner (deal_owners join), search (name/display_id).
 */
export async function listDeals(filters?: DealListFilters) {
  const uid = await requireUid();
  const f = listFiltersSchema.parse(filters) ?? {};

  // Build with all filters as parameters; NULL params no-op via the `IS NULL OR`
  // pattern so we keep a single static statement (injection-safe). The owner
  // filter checks membership in deal_owners (the authoritative join), NOT the
  // cached primary_owner_id pointer.
  const stage = f.stage ?? null;
  const ownerId = f.owner ?? null;
  const search = f.search ? `%${f.search}%` : null;

  const query = sql`
    SELECT *
    FROM v_deal_rollup
    WHERE (${stage}::text IS NULL OR stage::text = ${stage})
      AND (
        ${ownerId}::uuid IS NULL
        OR EXISTS (
          SELECT 1 FROM deal_owners do2
          WHERE do2.deal_id = v_deal_rollup.id AND do2.user_id = ${ownerId}::uuid
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

export type ContactPickerOption = {
  id: string;
  full_name: string;
  display_id: string;
};

/**
 * listContactOptions — contact picker for the Create Deal dialog. A deal REQUIRES
 * a contact_id, so creators pick from the contacts they can see (RLS-gated).
 */
export async function listContactOptions(): Promise<ContactPickerOption[]> {
  const uid = await requireUid();
  return asUser<ContactPickerOption>(
    uid,
    sql`
      SELECT id, full_name, display_id
      FROM contacts
      WHERE archived_at IS NULL
      ORDER BY full_name
      LIMIT 500
    `,
  );
}

export type DealOwnerRow = {
  deal_id: string;
  user_id: string;
  full_name: string | null;
};

/**
 * listOwnersForDeals — batch fetch owners for a set of deals so the list can
 * render multi-owner avatar chips per row without N+1 reads. RLS-gated.
 */
export async function listOwnersForDeals(
  dealIds: string[],
): Promise<DealOwnerRow[]> {
  const uid = await requireUid();
  if (dealIds.length === 0) return [];
  return asUser<DealOwnerRow>(
    uid,
    sql`
      SELECT d.deal_id, d.user_id, u.full_name
      FROM deal_owners d
      JOIN users u ON u.id = d.user_id
      WHERE d.deal_id = ANY(${dealIds}::uuid[])
      ORDER BY d.created_at
    `,
  );
}

/**
 * getDeal — one deal (rollup) plus its billing (v_deal_billing), owners (with
 * user names), tags, and the parent contact's name. Reads via asUser so RLS
 * applies to each table. Returns null when not found OR RLS-denied (developers).
 */
export async function getDeal(id: string) {
  const uid = await requireUid();
  const dealId = uuidSchema.parse(id);

  const [dealRows, billingRows, owners, tags] = await Promise.all([
    asUser(uid, sql`SELECT * FROM v_deal_rollup WHERE id = ${dealId}::uuid`),
    asUser(
      uid,
      sql`SELECT received, outstanding, pct_collected, agreed, currency FROM v_deal_billing WHERE deal_id = ${dealId}::uuid`,
    ),
    asUser(
      uid,
      sql`
        SELECT do2.user_id, u.full_name, u.email, do2.created_at
        FROM deal_owners do2
        JOIN users u ON u.id = do2.user_id
        WHERE do2.deal_id = ${dealId}::uuid
        ORDER BY do2.created_at
      `,
    ),
    asUser(
      uid,
      sql`
        SELECT tag, created_at
        FROM deal_tags
        WHERE deal_id = ${dealId}::uuid
        ORDER BY created_at
      `,
    ),
  ]);

  const deal = dealRows[0] ?? null;
  if (!deal) return null; // not found OR RLS-denied (indistinguishable, by design)

  const typedDeal = deal as { contact_id: string; company_id: string | null };

  // The parent contact + company (best-effort; RLS may deny them for some roles,
  // in which case the header just omits them).
  const [contactRows, companyRows] = await Promise.all([
    asUser(
      uid,
      sql`SELECT id, full_name FROM contacts WHERE id = ${typedDeal.contact_id}::uuid`,
    ),
    typedDeal.company_id
      ? asUser(
          uid,
          sql`SELECT id, name FROM companies WHERE id = ${typedDeal.company_id}::uuid`,
        )
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  return {
    deal,
    billing: billingRows[0] ?? null,
    owners,
    tags,
    contact: contactRows[0] ?? null,
    company: companyRows[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// RELATED-ENTITY READS (right-rail cockpit cards). All RLS-gated via asUser, so
// a developer (who is walled from deals entirely) gets nothing here either.
// ---------------------------------------------------------------------------

/** listDealProjects — delivery projects spawned from this deal (projects.deal_id). */
export async function listDealProjects(dealId: string) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);
  return asUser(
    uid,
    sql`
      SELECT id, display_id, name, status::text AS status
      FROM projects
      WHERE deal_id = ${dId}::uuid AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 6
    `,
  );
}

/** listDealPayments — payments attributed to this deal (payments.deal_id). */
export async function listDealPayments(dealId: string) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);
  return asUser(
    uid,
    sql`
      SELECT id, display_id, amount, currency, status::text AS status, payment_date
      FROM payments
      WHERE deal_id = ${dId}::uuid AND archived_at IS NULL
      ORDER BY payment_date DESC NULLS LAST, created_at DESC
      LIMIT 6
    `,
  );
}

/** getDealContact — the deal's parent contact (id + name). RLS-gated. */
export async function getDealContact(dealId: string) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);
  const rows = await asUser(
    uid,
    sql`
      SELECT c.id, c.full_name
      FROM deals d
      JOIN contacts c ON c.id = d.contact_id
      WHERE d.id = ${dId}::uuid
    `,
  );
  return rows[0] ?? null;
}

/** getDealCompany — the deal's cached company (id + name). RLS-gated. */
export async function getDealCompany(dealId: string) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);
  const rows = await asUser(
    uid,
    sql`
      SELECT co.id, co.name
      FROM deals d
      JOIN companies co ON co.id = d.company_id
      WHERE d.id = ${dId}::uuid
    `,
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// CONVERSATION (deal negotiation history) — write path. Read uses the universal
// listConversation('deal', id). sendDealMessage records an OUTBOUND entry under
// parent_type='deal' (the contact action hardcodes 'contact', so deals need their
// own). Honest: recorded locally, NOT delivered to the external channel.
// ---------------------------------------------------------------------------
const sendDealMessageSchema = z
  .object({
    channel: z.string().min(1).max(40),
    body: z.string().min(1).max(20000),
  })
  .strict();

export type SendDealMessageInput = z.infer<typeof sendDealMessageSchema>;

export async function sendDealMessage(
  dealId: string,
  input: SendDealMessageInput,
) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);
  const data = sendDealMessageSchema.parse(input);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO conversation_entries
        (parent_type, parent_id, channel, direction, sender_user_id, body, occurred_at)
      VALUES (
        'deal'::entity_type,
        ${dId}::uuid,
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

// ---------------------------------------------------------------------------
// CONVERT TO PROJECT — the "Deal won" action from the detail cockpit. Creates a
// delivery project linked to this deal (projects.deal_id); the spine trigger
// caches contact_id/company_id from the deal. display_id is trigger-assigned.
// RLS projects_insert gates it. Idempotency is NOT enforced here — the caller's
// UI hides the action once a project exists; we still surface the linked project.
// ---------------------------------------------------------------------------
export async function convertDealToProject(dealId: string) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);

  // Read the deal's name (RLS-gated) so the project inherits a sensible name.
  const dealRows = await asUser(
    uid,
    sql`SELECT name FROM deals WHERE id = ${dId}::uuid AND archived_at IS NULL`,
  );
  const deal = dealRows[0] as { name: string } | undefined;
  if (!deal) {
    throw new Error('Convert not permitted or deal not found');
  }

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO projects (name, deal_id, status)
      VALUES (${deal.name}, ${dId}::uuid, 'upcoming'::project_status)
      RETURNING id, display_id, name, status::text AS status
    `,
  );
  if (rows.length === 0) {
    throw new Error('Convert not permitted');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------------------

/**
 * createDeal — INSERT. name + contact_id required. display_id is assigned by the
 * fn_assign_display_id trigger (do NOT set it). company_id is trigger-cached
 * from the contact (do NOT set it). Spine caches are trigger-set.
 */
export async function createDeal(input: CreateDealInput) {
  const uid = await requireUid();
  const data = createDealSchema.parse(input);

  const query = sql`
    INSERT INTO deals (name, contact_id, payment_type, deal_value, currency, stage, close_date, primary_owner_id)
    VALUES (
      ${data.name},
      ${data.contact_id}::uuid,
      ${data.payment_type ?? null}::payment_type,
      ${data.deal_value ?? null},
      ${data.currency ?? null},
      COALESCE(${data.stage ?? null}::deal_stage, 'new'::deal_stage),
      ${data.close_date ?? null}::date,
      ${data.primary_owner_id ?? null}
    )
    RETURNING *
  `;
  const rows = await asUser(uid, query);
  return rows[0];
}

/**
 * updateDealField — single-column PATCH. `field` MUST be in the allowlist; any
 * other field is rejected before the DB is touched. One UPDATE. RLS gates it.
 */
export async function updateDealField(
  id: string,
  field: string,
  value: unknown,
) {
  const uid = await requireUid();
  const dealId = uuidSchema.parse(id);

  if (!EDITABLE_SET.has(field)) {
    throw new Error(`Field not editable: ${field}`);
  }

  const rows = await asUser(
    uid,
    buildUpdate(field as EditableField, dealId, value),
  );
  if (rows.length === 0) {
    // Zero rows = RLS denied the write or the id doesn't exist.
    throw new Error('Update not permitted or deal not found');
  }
  return rows[0];
}

/**
 * archiveDeal — the "delete" action. Sets archived_at. NEVER a DELETE.
 */
export async function archiveDeal(id: string) {
  const uid = await requireUid();
  const dealId = uuidSchema.parse(id);

  const rows = await asUser(
    uid,
    sql`
      UPDATE deals
      SET archived_at = now(), updated_at = now()
      WHERE id = ${dealId}::uuid AND archived_at IS NULL
      RETURNING id, archived_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Archive not permitted or deal not found');
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// OWNERSHIP (deal_owners join — DELETE is the documented exception)
// ---------------------------------------------------------------------------

export async function addDealOwner(dealId: string, userId: string) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);
  const uId = uuidSchema.parse(userId);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO deal_owners (deal_id, user_id)
      VALUES (${dId}::uuid, ${uId}::uuid)
      ON CONFLICT (deal_id, user_id) DO NOTHING
      RETURNING id, deal_id, user_id, created_at
    `,
  );
  return rows[0] ?? null; // null if it already existed (idempotent add)
}

export async function removeDealOwner(dealId: string, userId: string) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);
  const uId = uuidSchema.parse(userId);

  // Join-table membership removal — the documented DELETE exception.
  const rows = await asUser(
    uid,
    sql`
      DELETE FROM deal_owners
      WHERE deal_id = ${dId}::uuid AND user_id = ${uId}::uuid
      RETURNING id
    `,
  );
  return { removed: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// TAGS (deal_tags — free-text multi-value join table)
// ---------------------------------------------------------------------------

export async function addDealTag(dealId: string, tag: string) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);
  const t = z.string().min(1).max(100).parse(tag);

  const rows = await asUser(
    uid,
    sql`
      INSERT INTO deal_tags (deal_id, tag)
      VALUES (${dId}::uuid, ${t})
      ON CONFLICT (deal_id, tag) DO NOTHING
      RETURNING id, deal_id, tag, created_at
    `,
  );
  return rows[0] ?? null;
}

export async function removeDealTag(dealId: string, tag: string) {
  const uid = await requireUid();
  const dId = uuidSchema.parse(dealId);
  const t = z.string().min(1).max(100).parse(tag);

  const rows = await asUser(
    uid,
    sql`
      DELETE FROM deal_tags
      WHERE deal_id = ${dId}::uuid AND tag = ${t}
      RETURNING id
    `,
  );
  return { removed: rows.length > 0 };
}
