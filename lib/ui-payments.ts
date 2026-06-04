// lib/ui-payments.ts — Payments presentation maps (tokens-only).
//
// Every pill value here is a Tailwind utility class backed by a token in
// design/tokens.json. NO hex, NO px, NO arbitrary values. Mirrors lib/ui-deals.ts
// but scoped to payment-specific enums so it doesn't collide with shared lib/ui.ts.

// ---------------------------------------------------------------------------
// payment_status enum (0001):
//   due, overdue, client_paid, received, confirmed, in_team_accounts
// Mapped onto semantic token families:
//   due           → info (awaiting)
//   overdue       → danger (late)
//   client_paid   → warning (claimed-but-unverified)
//   received      → accent (in hand, not yet confirmed)
//   confirmed     → success (finance gate passed)
//   in_team_accounts → success (reconciled)
// ---------------------------------------------------------------------------
export const PAYMENT_STATUSES = [
  'due',
  'overdue',
  'client_paid',
  'received',
  'confirmed',
  'in_team_accounts',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  due: 'Due',
  overdue: 'Overdue',
  client_paid: 'Client paid',
  received: 'Received',
  confirmed: 'Confirmed',
  in_team_accounts: 'In team accounts',
};

export const PAYMENT_STATUS_PILL: Record<string, string> = {
  due: 'bg-info-bg text-info-text border-info-border',
  overdue: 'bg-danger-bg text-danger-text border-danger-border',
  client_paid: 'bg-warning-bg text-warning-text border-warning-border',
  received: 'bg-accent-subtle text-accent-text border-accent-border',
  confirmed: 'bg-success-bg text-success-text border-success-border',
  in_team_accounts: 'bg-success-bg text-success-text border-success-border',
};

// ---------------------------------------------------------------------------
// Status → colored-dot token (var()) for the design's clickable .statuspill and
// the list .status pill. Returned as a CSS var() string so inline styles stay
// tokens-only (no raw hex).
// ---------------------------------------------------------------------------
export const PAYMENT_STATUS_DOT: Record<string, string> = {
  due: 'var(--color-info-solid)',
  overdue: 'var(--color-danger-solid)',
  client_paid: 'var(--color-warning-solid)',
  received: 'var(--color-accent)',
  confirmed: 'var(--color-success-solid)',
  in_team_accounts: 'var(--color-success-solid)',
};

// ---------------------------------------------------------------------------
// Status → token-backed inline pill style (background / text / border var()s) for
// the design's hero .statuspill, rendered with inline styles (not Tailwind
// utilities) because it lives in the contact-detail.css cockpit chrome.
// ---------------------------------------------------------------------------
export const PAYMENT_STATUS_PILL_STYLE: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  due: {
    bg: 'var(--color-info-bg)',
    text: 'var(--color-info-text)',
    border: 'var(--color-info-border)',
  },
  overdue: {
    bg: 'var(--color-danger-bg)',
    text: 'var(--color-danger-text)',
    border: 'var(--color-danger-border)',
  },
  client_paid: {
    bg: 'var(--color-warning-bg)',
    text: 'var(--color-warning-text)',
    border: 'var(--color-warning-border)',
  },
  received: {
    bg: 'var(--color-accent-subtle)',
    text: 'var(--color-accent-text)',
    border: 'var(--color-accent-border)',
  },
  confirmed: {
    bg: 'var(--color-success-bg)',
    text: 'var(--color-success-text)',
    border: 'var(--color-success-border)',
  },
  in_team_accounts: {
    bg: 'var(--color-success-bg)',
    text: 'var(--color-success-text)',
    border: 'var(--color-success-border)',
  },
};

// ---------------------------------------------------------------------------
// Lifecycle rail (Payment Detail.html): draft → sent → paid → confirmed. We map
// our six payment_status values onto a lifecycle of presentational nodes. Each
// node has a state: 'done' (passed), 'current' (active), 'upcoming'. The rail is
// presentational ONLY — it NEVER drives a status write (that is the finance-gated
// ConfirmButton / StatusControl). It merely reads the lifecycle from status.
// ---------------------------------------------------------------------------
export type LifecycleState = 'done' | 'current' | 'upcoming';

export const LIFECYCLE_NODES = [
  'Invoiced',
  'Sent',
  'Awaiting',
  'Paid',
  'Confirmed',
] as const;

// Index of the CURRENT node per status; nodes before it are 'done', after it are
// 'upcoming'. confirmed/in_team_accounts push the index past the last node so all
// five render 'done'.
const LIFECYCLE_CURRENT_INDEX: Record<string, number> = {
  due: 2, // awaiting payment
  overdue: 2, // awaiting payment (late)
  client_paid: 3, // paid (client-claimed)
  received: 4, // confirmed is current (finance not done)
  confirmed: 5, // all done
  in_team_accounts: 5, // all done
};

export function lifecycleStates(status: string): LifecycleState[] {
  const cur = LIFECYCLE_CURRENT_INDEX[status] ?? 2;
  return LIFECYCLE_NODES.map((_node, i) => {
    if (i < cur) return 'done';
    if (i === cur) return 'current';
    return 'upcoming';
  });
}

// ---------------------------------------------------------------------------
// Compact money — "₹48.6L" / "₹1.2Cr" / "$15.0K" style for the list's aggregate
// Received / Outstanding metric cards. INR uses lakh/crore grouping (matching
// Payments.html); other currencies fall back to K/M with their symbol.
// ---------------------------------------------------------------------------
export function formatMoneyCompact(
  value: string | number | null | undefined,
  currency?: string | null,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  const code = (currency ?? 'USD').toUpperCase();
  const abs = Math.abs(n);
  if (code === 'INR') {
    if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
    if (abs >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
    return `₹${n.toFixed(0)}`;
  }
  const sym = code === 'USD' ? '$' : code === 'EUR' ? '€' : `${code} `;
  if (abs >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${n.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// against-tag: a payment hangs off a deal, optionally a milestone / project. The
// design renders a small mono "against" chip with an icon. We surface the kind
// (which drives the icon) + the label. The page resolves the label from context.
// ---------------------------------------------------------------------------
export type AgainstKind = 'deal' | 'project' | 'milestone';

export const AGAINST_KIND_LABEL: Record<AgainstKind, string> = {
  deal: 'Deal',
  project: 'Project',
  milestone: 'Milestone',
};

// ---------------------------------------------------------------------------
// Statuses a non-finance/non-admin (e.g. sales) may set when CREATING a payment.
// RLS payments_insert enforces this at the DB layer; we mirror it in the picker
// + action for a clean UX and an early, explicit refusal.
// ---------------------------------------------------------------------------
export const SALES_INSERTABLE_STATUSES = ['due', 'client_paid'] as const;

// ---------------------------------------------------------------------------
// The confirm gate: ONLY admin/finance may set these via confirmPayment /
// setPaymentStatus. RLS payments_update WITH CHECK enforces it; a PM is refused
// with 42501. We mirror the set here so the UI can pre-disable where helpful.
// ---------------------------------------------------------------------------
export const CONFIRM_GATED_STATUSES = ['confirmed', 'in_team_accounts'] as const;

// ---------------------------------------------------------------------------
// payment_type enum (0001): milestone, one_time, early, retainer, subscription
// ---------------------------------------------------------------------------
export const PAYMENT_TYPES = [
  'milestone',
  'one_time',
  'early',
  'retainer',
  'subscription',
] as const;

export const PAYMENT_TYPE_LABEL: Record<string, string> = {
  milestone: 'Milestone',
  one_time: 'One-time',
  early: 'Early',
  retainer: 'Retainer',
  subscription: 'Subscription',
};

// ---------------------------------------------------------------------------
// Money formatter — read-only display of amount + computed billing. Numbers come
// from the DB as strings (numeric) or numbers; coerce defensively.
// ---------------------------------------------------------------------------
export function formatMoney(
  value: string | number | null | undefined,
  currency?: string | null,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  const code = (currency ?? 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Unknown/blank currency code → plain number with the raw code suffix.
    return `${n.toLocaleString()} ${code}`.trim();
  }
}

export function formatPct(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `${n}%`;
}

// ---------------------------------------------------------------------------
// Date formatter — payment_date is a `date` column; the neon driver returns it
// as a Date object (or string). Coerce defensively to YYYY-MM-DD for display.
// ---------------------------------------------------------------------------
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string') return value.slice(0, 10);
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}
