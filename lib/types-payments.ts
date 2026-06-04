// lib/types-payments.ts — view-model shapes the Payments UI reads. Mirrors the
// columns the payment server actions return (payments table + deal context +
// v_deal_billing). The DB is the source of truth; these are convenience types,
// intentionally loose on nullability. Kept in a payments-specific file to avoid
// colliding with shared lib/types.ts (other entity agents work in parallel).

export type PaymentRow = {
  id: string;
  display_id: string;
  deal_id: string;
  project_id: string | null;
  milestone_id: string | null;
  contact_id: string | null;
  amount: string | number | null;
  currency: string | null;
  payment_type: string | null;
  payment_date: string | Date | null;
  transaction_ref: string | null;
  status: string;
  created_by: string | null;
  confirmed_by: string | null;
  note: string | null;
  // timestamptz — the neon driver returns these as Date objects (coerce on read):
  created_at: string | Date;
  updated_at: string | Date;
  // deal context joined into list/detail reads (best-effort; RLS may omit):
  deal_name?: string | null;
  deal_display_id?: string | null;
  // actor names resolved in getPayment for the activity log (LEFT JOIN users):
  created_by_name?: string | null;
  confirmed_by_name?: string | null;
};

// Linked context surfaced on the detail page's "against" tag + lifecycle copy.
export type PaymentContextRef = {
  id: string;
  name: string;
  display_id: string;
};

export type PaymentBilling = {
  agreed: string | number | null;
  currency: string | null;
  received: string | number | null;
  outstanding: string | number | null;
  pct_collected: string | number | null;
};

export type PaymentDeal = {
  id: string;
  name: string;
  display_id: string;
};
