// lib/types-deals.ts — view-model shapes the Deals UI reads. Mirrors the columns
// the deal server actions return (v_deal_rollup + v_deal_billing + join reads).
// The DB is the source of truth; these are convenience types, intentionally
// loose on nullability. Kept in a deals-specific file to avoid colliding with
// shared lib/types.ts (other entity agents work in parallel).

export type DealRollup = {
  id: string;
  display_id: string;
  name: string;
  contact_id: string;
  company_id: string | null;
  primary_owner_id: string | null;
  payment_type: string | null;
  deal_value: string | number | null;
  currency: string | null;
  stage: string;
  close_date: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  // rollup-computed (v_deal_rollup):
  received: string | number | null;
  outstanding: string | number | null;
  pct_collected: string | number | null;
  project_count: number | null;
  task_count: number | null;
  avg_rating: string | number | null;
};

export type DealBilling = {
  agreed: string | number | null;
  currency: string | null;
  received: string | number | null;
  outstanding: string | number | null;
  pct_collected: string | number | null;
};

export type DealOwner = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

export type DealTag = {
  tag: string;
  created_at: string;
};

export type DealContact = {
  id: string;
  full_name: string;
};

export type DealCompany = {
  id: string;
  name: string;
};

// Related-entity summary rows for the right-rail cockpit cards.
export type DealProjectRow = {
  id: string;
  display_id: string;
  name: string;
  status: string;
};

export type DealPaymentRow = {
  id: string;
  display_id: string;
  amount: string | number | null;
  currency: string | null;
  status: string;
  payment_date: string | null;
};
