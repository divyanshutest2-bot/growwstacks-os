// lib/types.ts — view-model shapes the UI reads. These mirror the columns the
// server actions return (v_contact_rollup + join reads). The DB is the source of
// truth; these are convenience types, intentionally loose on nullability.

export type ContactRollup = {
  id: string;
  display_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  slack_id: string | null;
  teams_channel: string | null;
  teams_channel_id: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  main_platform: string | null;
  status: string;
  rating: string | null;
  // job_title (contacts.job_title, migration 0016) — populated by getContact's
  // join; absent on list rows (v_contact_rollup doesn't expose it).
  job_title?: string | null;
  primary_owner_id: string | null;
  company_id: string | null;
  about: string | null;
  is_client_portal_enabled: boolean;
  created_at: string;
  updated_at: string;
  // rollup-computed:
  lifetime_value_received: string | number | null;
  total_deals: number | null;
  open_deals: number | null;
  total_projects: number | null;
  active_projects: number | null;
  last_activity_at: string | null;
};

export type CompanyRollup = {
  id: string;
  display_id: string;
  name: string;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  type: string | null;
  account_owner_id: string | null;
  about: string | null;
  created_at: string;
  updated_at: string;
  // rollup-computed (v_company_rollup):
  contact_count: number | null;
  lifetime_value_received: string | number | null;
  total_deals: number | null;
  total_projects: number | null;
  active_projects: number | null;
};

export type ContactOwner = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

export type LeadSource = {
  lead_source: string;
  created_at: string;
};

export type NoteRow = {
  id: string;
  title: string | null;
  body: string | null;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
};

export type AttachmentRow = {
  id: string;
  kind: string;
  title: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  purpose: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

export type ConversationRow = {
  id: string;
  channel: string;
  direction: string;
  sender_user_id: string | null;
  sender_user_name: string | null;
  sender_contact_id: string | null;
  sender_contact_name: string | null;
  body: string | null;
  occurred_at: string;
  meeting_summary: string | null;
  meeting_recording_url: string | null;
  duration_minutes: number | null;
};

// Related-entity summary rows for the contact cockpit's right rail.
export type ContactProjectRow = {
  id: string;
  display_id: string;
  name: string;
  status: string;
};

export type ContactMilestoneRow = {
  id: string;
  display_id: string;
  name: string;
  status: string;
  target_date: string | null;
};

export type ContactTaskRow = {
  id: string;
  display_id: string;
  title: string;
  status: string;
  plan_due_date: string | null;
};

export type ContactDealRow = {
  id: string;
  display_id: string;
  name: string;
  stage: string;
  deal_value: string | number | null;
  currency: string | null;
};

// Credential METADATA only — secret_ref is NEVER selected (column-level deny).
export type ContactCredentialRow = {
  id: string;
  label: string;
  login_url: string | null;
  username: string | null;
};

// Related-entity rows for the company cockpit.
export type CompanyContactRow = {
  id: string;
  display_id: string;
  full_name: string;
  // job_title omitted until migration 0016 (contacts.job_title) is applied.
  status: string;
  is_client_portal_enabled: boolean;
};

export type CompanyProjectRow = {
  id: string;
  display_id: string;
  name: string;
  status: string;
  completion_pct: string | number | null;
};

export type CompanyDealRow = {
  id: string;
  display_id: string;
  name: string;
  stage: string;
  deal_value: string | number | null;
  currency: string | null;
};

export type CompanyTaskRow = {
  id: string;
  display_id: string;
  title: string;
  status: string;
  plan_due_date: string | null;
};

export type CompanyCredentialRow = {
  id: string;
  label: string;
  login_url: string | null;
  username: string | null;
};

export type AiInsightRow = {
  id: string;
  kind: string;
  sentiment: string | null;
  body: string;
  generated_at: string;
  generated_by: string;
  is_active: boolean;
};
