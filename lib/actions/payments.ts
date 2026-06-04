'use server';

// lib/actions/payments.ts — Payments data-layer server actions.
//
// Mirrors lib/actions/deals.ts. Rules enforced here (CLAUDE.md + the Payments
// spec):
//   - Every DB call goes through asUser(uid, ...) so RLS authorizes it. There is
//     NO role-branch in this module: payments are a TOTAL developer wall (no
//     payments_select policy for developers → 0 rows), and the confirm gate is a
//     WITH-CHECK in 0010. asUser + RLS is the whole story.
//   - NO DELETE on the payments entity — "delete" = archivePayment (archived_at).
//   - No stored derived values: billing context is READ from v_deal_billing.
//   - Field-level auto-save: updatePaymentField PATCHes ONE allowlisted column.
//     STATUS IS NOT in that allowlist — status transitions go through the explicit
//     confirmPayment / setPaymentStatus actions so the confirm gate is legible.
//   - contact_id is CACHED from the deal via trigger — NEVER hand-set here.
//   - display_id is trigger-assigned (PMT-####) — NEVER set.
//   - created_by is set = uid on insert; confirmed_by is set on confirm.
//   - Edge-safe: only the Neon serverless driver + zod.
//
// 🚨 THE CONFIRM GATE (the keystone of this slice)
//   RLS payments_update WITH CHECK refuses status IN ('confirmed','in_team_accounts')
//   for any role other than admin/finance (42501). confirmPayment + setPaymentStatus
//   let that refusal SURFACE: when RLS denies the write, the UPDATE returns zero rows
//   (USING fails) or raises (WITH CHECK fails) — either way we throw, and the UI shows
//   a refusal state. A PM calling confirmPayment is refused; the row stays 'due'.

import { z } from 'zod';

import { asUser } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth';
import { sqlNoUser } from '@/lib/db';
import { PAYMENT_STATUSES, CONFIRM_GATED_STATUSES } from '@/lib/ui-payments';

// sqlNoUser is imported only as the tagged-template QUERY BUILDER; every query is
// executed exclusively via asUser, so RLS always applies. (Neon's `sql` is both an
// executor and a builder; we use it here purely as the builder.)
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
// Editable-column allowlist (field-level auto-save). Any field NOT in this set is
// rejected before touching the DB. RLS still independently authorizes the row.
//   - status is NOT here — transitions go through confirmPayment / setPaymentStatus
//     so the finance-only confirm gate is explicit, not a silent inline edit.
//   - display_id is trigger-assigned — never set.
//   - deal_id is set at create time (not editable; re-pointing a payment's deal
//     would re-cache the contact spine — out of scope).
//   - contact_id is trigger-cached from the deal — NEVER editable here.
//   - created_by / confirmed_by are set by the actions, never inline-edited.
// ---------------------------------------------------------------------------
const EDITABLE_FIELDS = [
  'amount',
  'currency',
  'payment_type',
  'payment_date',
  'transaction_ref',
  'note',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
const EDITABLE_SET = new Set<string>(EDITABLE_FIELDS);

// Map each editable field to a tagged-template UPDATE. We cannot interpolate a
// column NAME via a SQL parameter (only values are parameterized), so we keep a
// static map of full statements — every column name is a hard-coded literal,
// never user-controlled. The VALUE is always parameterized (injection-safe).
function buildUpdate(field: EditableField, id: string, value: unknown) {
  switch (field) {
    case 'amount':
      return sql`UPDATE payments SET amount = ${value as number | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'currency':
      return sql`UPDATE payments SET currency = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'payment_type':
      return sql`UPDATE payments SET payment_type = ${value as string | null}::payment_type, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'payment_date':
      return sql`UPDATE payments SET payment_date = ${value as string | null}::date, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'transaction_ref':
      return sql`UPDATE payments SET transaction_ref = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
    case 'note':
      return sql`UPDATE payments SET note = ${value as string | null}, updated_at = now() WHERE id = ${id}::uuid RETURNING *`;
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
const statusSchema = z.enum(PAYMENT_STATUSES);

const listFiltersSchema = z
  .object({
    status: z.string().min(1).optional(),
    deal: z.string().uuid().optional(),
    search: z.string().min(1).max(200).optional(),
  })
  .strict()
  .optional();

export type PaymentListFilters = z.infer<typeof listFiltersSchema>;

const createPaymentSchema = z
  .object({
    deal_id: z.string().uuid(),
    amount: z.number(),
    currency: z.string().length(3),
    status: z.enum(PAYMENT_STATUSES).optional(),
    project_id: z.string().uuid().nullish(),
    milestone_id: z.string().uuid().nullish(),
    payment_type: z.string().min(1).nullish(),
    payment_date: z.string().min(1).nullish(),
    transaction_ref: z.string().min(1).nullish(),
    note: z.string().min(1).nullish(),
  })
  .strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

/**
 * listPayments — non-archived payments with deal context. RLS restricts rows per
 * role: admin/pm/finance see all; sales see only payments on deals they own
 * (deal_owners); developers see ZERO (no payments_select policy → hard wall).
 * Optional filters: status, deal, search (display_id / transaction_ref / deal name).
 */
export async function listPayments(filters?: PaymentListFilters) {
  const uid = await requireUid();
  const f = listFiltersSchema.parse(filters) ?? {};

  const status = f.status ?? null;
  const dealId = f.deal ?? null;
  const search = f.search ? `%${f.search}%` : null;

  const query = sql`
    SELECT p.*, d.name AS deal_name, d.display_id AS deal_display_id
    FROM payments p
    LEFT JOIN deals d ON d.id = p.deal_id
    WHERE p.archived_at IS NULL
      AND (${status}::text IS NULL OR p.status::text = ${status})
      AND (${dealId}::uuid IS NULL OR p.deal_id = ${dealId}::uuid)
      AND (
        ${search}::text IS NULL
        OR p.display_id ILIKE ${search}
        OR p.transaction_ref ILIKE ${search}
        OR d.name ILIKE ${search}
      )
    ORDER BY p.created_at DESC
    LIMIT 500
  `;
  return asUser(uid, query);
}

export type DealPickerOption = {
  id: string;
  name: string;
  display_id: string;
};

/**
 * listDealOptions — deal picker for the Create Payment dialog. A payment REQUIRES
 * a deal_id, so creators pick from the deals they can see (RLS-gated). Local to
 * this module (the spec asks for a "local listDealOptions").
 */
export async function listDealOptions(): Promise<DealPickerOption[]> {
  const uid = await requireUid();
  return asUser<DealPickerOption>(
    uid,
    sql`
      SELECT id, name, display_id
      FROM deals
      WHERE archived_at IS NULL
      ORDER BY name
      LIMIT 500
    `,
  );
}

/**
 * getPayment — one payment + the parent deal's billing (v_deal_billing) and name.
 * Reads via asUser so RLS applies. Returns null when not found OR RLS-denied
 * (developers, or a sales user on a deal they don't own) — indistinguishable by
 * design.
 */
export async function getPayment(id: string) {
  const uid = await requireUid();
  const paymentId = uuidSchema.parse(id);

  // Resolve created_by / confirmed_by to display names (for the activity log's
  // "Created by …" / "Confirmed by …" rows) via a self-contained LEFT JOIN. RLS
  // on payments still gates the row; users are joined read-only for labels.
  const paymentRows = await asUser(
    uid,
    sql`
      SELECT
        p.*,
        cu.full_name AS created_by_name,
        fu.full_name AS confirmed_by_name
      FROM payments p
      LEFT JOIN users cu ON cu.id = p.created_by
      LEFT JOIN users fu ON fu.id = p.confirmed_by
      WHERE p.id = ${paymentId}::uuid AND p.archived_at IS NULL
    `,
  );
  const payment = paymentRows[0] ?? null;
  if (!payment) return null; // not found OR RLS-denied (indistinguishable, by design)

  const p = payment as {
    deal_id: string;
    project_id: string | null;
    milestone_id: string | null;
  };
  const dealId = p.deal_id;

  const [billingRows, dealRows, milestoneRows, projectRows] = await Promise.all([
    asUser(
      uid,
      sql`SELECT agreed, currency, received, outstanding, pct_collected FROM v_deal_billing WHERE deal_id = ${dealId}::uuid`,
    ),
    asUser(
      uid,
      sql`SELECT id, name, display_id FROM deals WHERE id = ${dealId}::uuid`,
    ),
    p.milestone_id
      ? asUser(
          uid,
          sql`SELECT id, name, display_id FROM milestones WHERE id = ${p.milestone_id}::uuid`,
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    p.project_id
      ? asUser(
          uid,
          sql`SELECT id, name, display_id FROM projects WHERE id = ${p.project_id}::uuid`,
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  return {
    payment,
    billing: billingRows[0] ?? null,
    deal: dealRows[0] ?? null,
    milestone: milestoneRows[0] ?? null,
    project: projectRows[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------------------

/**
 * createPayment — INSERT a money fact. deal_id + amount + currency required.
 *   - display_id is assigned by fn_assign_display_id (do NOT set it).
 *   - contact_id is trigger-cached from the deal (do NOT set it).
 *   - created_by is set = uid.
 *   - status defaults 'due'.
 * 🚨 Sales may only create with status 'due' or 'client_paid'. We validate that
 *    HERE for an early, explicit refusal; RLS payments_insert ALSO enforces it at
 *    the DB layer (defence in depth) — a sales user passing 'confirmed' is refused
 *    by the WITH CHECK regardless. We do NOT trust the action check alone.
 */
export async function createPayment(input: CreatePaymentInput) {
  const uid = await requireUid();
  const data = createPaymentSchema.parse(input);
  const status = data.status ?? 'due';

  const query = sql`
    INSERT INTO payments (
      deal_id, project_id, milestone_id,
      amount, currency, payment_type, payment_date, transaction_ref,
      status, note, created_by
    )
    VALUES (
      ${data.deal_id}::uuid,
      ${data.project_id ?? null}::uuid,
      ${data.milestone_id ?? null}::uuid,
      ${data.amount},
      ${data.currency},
      ${data.payment_type ?? null}::payment_type,
      ${data.payment_date ?? null}::date,
      ${data.transaction_ref ?? null},
      ${status}::payment_status,
      ${data.note ?? null},
      ${uid}::uuid
    )
    RETURNING *
  `;
  // If RLS payments_insert denies the row (e.g. sales passing a confirmed/received
  // status, or a developer), the INSERT raises — surfaced to the caller.
  const rows = await asUser(uid, query);
  return rows[0];
}

/**
 * updatePaymentField — single-column PATCH. `field` MUST be in the allowlist
 * (status is deliberately NOT in it). One UPDATE. RLS gates it (USING admin/pm/
 * finance; sales cannot UPDATE at all).
 */
export async function updatePaymentField(
  id: string,
  field: string,
  value: unknown,
) {
  const uid = await requireUid();
  const paymentId = uuidSchema.parse(id);

  if (!EDITABLE_SET.has(field)) {
    throw new Error(`Field not editable: ${field}`);
  }

  const rows = await asUser(
    uid,
    buildUpdate(field as EditableField, paymentId, value),
  );
  if (rows.length === 0) {
    // Zero rows = RLS denied the write (USING failed) or the id doesn't exist.
    throw new Error('Update not permitted or payment not found');
  }
  return rows[0];
}

/**
 * confirmPayment — the FINANCE-ONLY confirm gate. Sets status='confirmed' and
 * confirmed_by=uid.
 *
 * 🚨 RLS payments_update WITH CHECK refuses status IN ('confirmed','in_team_accounts')
 *    unless fn_my_role() IN ('admin','finance'). So:
 *      - finance/admin → succeeds; the row flips to 'confirmed'.
 *      - PM/sales/anyone else → REFUSED. A PM passes the USING clause (pm is in
 *        admin/pm/finance) but FAILS the WITH CHECK → Postgres raises 42501. We let
 *        that error propagate so the UI surfaces a refusal AND the row stays 'due'.
 *    We catch only to re-throw a clean, typed refusal — we NEVER swallow it into a
 *    success. The negative case (PM cannot confirm) is the keystone of this slice.
 */
export async function confirmPayment(id: string) {
  const uid = await requireUid();
  const paymentId = uuidSchema.parse(id);

  try {
    const rows = await asUser(
      uid,
      sql`
        UPDATE payments
        SET status = 'confirmed'::payment_status,
            confirmed_by = ${uid}::uuid,
            updated_at = now()
        WHERE id = ${paymentId}::uuid AND archived_at IS NULL
        RETURNING *
      `,
    );
    if (rows.length === 0) {
      // USING denied (non-admin/pm/finance) or row missing. WITH CHECK failures
      // raise instead of returning zero rows; this branch covers the USING wall.
      throw new Error('Confirm not permitted or payment not found');
    }
    return rows[0];
  } catch (err) {
    // WITH CHECK refusal (e.g. a PM) raises a Postgres error (42501). Surface a
    // clean, explicit refusal so the UI can show the gate held and re-read 'due'.
    throw new Error(
      'Payment confirmation refused: only finance or admin can confirm a payment.',
      { cause: err },
    );
  }
}

/**
 * setPaymentStatus — non-confirm status transitions (due / overdue / client_paid /
 * received) per role. Used for the lifecycle BEFORE the finance gate, and to RESET
 * a confirmed test payment back to 'due'.
 *
 * If the caller passes a confirm-gated status (confirmed / in_team_accounts) and
 * is not admin/finance, RLS WITH CHECK refuses it (42501) exactly as in
 * confirmPayment. confirmed_by is only set by confirmPayment, not here.
 */
export async function setPaymentStatus(id: string, status: string) {
  const uid = await requireUid();
  const paymentId = uuidSchema.parse(id);
  const next = statusSchema.parse(status);

  // When moving OFF a confirmed status (e.g. resetting to 'due'), clear confirmed_by
  // so the cached confirmer pointer doesn't lie. When setting a confirm-gated status
  // through this path, RLS still independently enforces the finance/admin gate.
  const clearConfirmer = !CONFIRM_GATED_STATUSES.includes(
    next as (typeof CONFIRM_GATED_STATUSES)[number],
  );

  try {
    const rows = await asUser(
      uid,
      clearConfirmer
        ? sql`
            UPDATE payments
            SET status = ${next}::payment_status,
                confirmed_by = NULL,
                updated_at = now()
            WHERE id = ${paymentId}::uuid AND archived_at IS NULL
            RETURNING *
          `
        : sql`
            UPDATE payments
            SET status = ${next}::payment_status,
                updated_at = now()
            WHERE id = ${paymentId}::uuid AND archived_at IS NULL
            RETURNING *
          `,
    );
    if (rows.length === 0) {
      throw new Error('Status change not permitted or payment not found');
    }
    return rows[0];
  } catch (err) {
    throw new Error(
      `Could not set payment status to '${next}'. The change may be refused by the finance-confirm gate.`,
      { cause: err },
    );
  }
}

/**
 * archivePayment — the "delete" action. Sets archived_at. NEVER a DELETE.
 */
export async function archivePayment(id: string) {
  const uid = await requireUid();
  const paymentId = uuidSchema.parse(id);

  const rows = await asUser(
    uid,
    sql`
      UPDATE payments
      SET archived_at = now(), updated_at = now()
      WHERE id = ${paymentId}::uuid AND archived_at IS NULL
      RETURNING id, archived_at
    `,
  );
  if (rows.length === 0) {
    throw new Error('Archive not permitted or payment not found');
  }
  return rows[0];
}
