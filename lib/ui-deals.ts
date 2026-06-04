// lib/ui-deals.ts — Deals presentation maps (tokens-only).
//
// Every pill value here is a Tailwind utility class backed by a token in
// design/tokens.json. NO hex, NO px, NO arbitrary values. Mirrors lib/ui.ts but
// scoped to deal-specific enums so it doesn't collide with shared lib/ui.ts.

// ---------------------------------------------------------------------------
// deal_stage enum (0001):
//   new, qualified, requirement_analysis, proposal, price_quote, negotiation,
//   review, payment_followup, approval, closed_won, closed_lost, on_hold,
//   handed_over, lost_after_handover, lost_no_response, lost_not_fit
// Mapped onto semantic token families (info=in-flight, success=won,
// danger=lost, warning=on-hold/handover, accent=mid-pipeline).
// ---------------------------------------------------------------------------
export const DEAL_STAGES = [
  'new',
  'qualified',
  'requirement_analysis',
  'proposal',
  'price_quote',
  'negotiation',
  'review',
  'payment_followup',
  'approval',
  'closed_won',
  'closed_lost',
  'on_hold',
  'handed_over',
  'lost_after_handover',
  'lost_no_response',
  'lost_not_fit',
] as const;

export const DEAL_STAGE_LABEL: Record<string, string> = {
  new: 'New',
  qualified: 'Qualified',
  requirement_analysis: 'Requirement analysis',
  proposal: 'Proposal',
  price_quote: 'Price quote',
  negotiation: 'Negotiation',
  review: 'Review',
  payment_followup: 'Payment follow-up',
  approval: 'Approval',
  closed_won: 'Closed won',
  closed_lost: 'Closed lost',
  on_hold: 'On hold',
  handed_over: 'Handed over',
  lost_after_handover: 'Lost after handover',
  lost_no_response: 'Lost — no response',
  lost_not_fit: 'Lost — not a fit',
};

// ---------------------------------------------------------------------------
// Stage dot color var() — for the cockpit status-pill + board column headers +
// list stage badges. Tokens-only (CSS var() primitives, never raw hex). Mid-
// pipeline stages share the iris/sky/amber families; won=green, lost=red.
// ---------------------------------------------------------------------------
export const DEAL_STAGE_DOT: Record<string, string> = {
  new: 'var(--n-400)',
  qualified: 'var(--sky-500)',
  requirement_analysis: 'var(--sky-500)',
  proposal: 'var(--iris-500)',
  price_quote: 'var(--iris-500)',
  negotiation: 'var(--amber-500)',
  review: 'var(--amber-500)',
  payment_followup: 'var(--amber-500)',
  approval: 'var(--sky-500)',
  closed_won: 'var(--green-500)',
  closed_lost: 'var(--red-500)',
  on_hold: 'var(--amber-500)',
  handed_over: 'var(--green-500)',
  lost_after_handover: 'var(--red-500)',
  lost_no_response: 'var(--red-500)',
  lost_not_fit: 'var(--red-500)',
};

// ---------------------------------------------------------------------------
// Win-probability per stage (%), used for the detail probability stat + the
// list's weighted-value column + the pipeline sub-line. Mirrors the design's
// PROB map, extended across the full 16-member deal_stage enum. Pure
// presentation — there is NO probability column in the DB.
// ---------------------------------------------------------------------------
export const STAGE_PROBABILITY: Record<string, number> = {
  new: 10,
  qualified: 30,
  requirement_analysis: 40,
  proposal: 55,
  price_quote: 60,
  negotiation: 75,
  review: 80,
  payment_followup: 90,
  approval: 90,
  closed_won: 100,
  closed_lost: 0,
  on_hold: 20,
  handed_over: 100,
  lost_after_handover: 0,
  lost_no_response: 0,
  lost_not_fit: 0,
};

// Won / Lost stage groupings — drive the distinct Won/Lost board columns and the
// "open pipeline" math (open = neither won nor lost).
export const WON_STAGES = new Set<string>(['closed_won', 'handed_over']);
export const LOST_STAGES = new Set<string>([
  'closed_lost',
  'lost_after_handover',
  'lost_no_response',
  'lost_not_fit',
]);

export function isWonStage(stage: string): boolean {
  return WON_STAGES.has(stage);
}
export function isLostStage(stage: string): boolean {
  return LOST_STAGES.has(stage);
}
export function isOpenStage(stage: string): boolean {
  return !isWonStage(stage) && !isLostStage(stage);
}

export function stageProbability(stage: string): number {
  return STAGE_PROBABILITY[stage] ?? 0;
}

// ---------------------------------------------------------------------------
// Board column model — the ordered set of swimlanes the Kanban renders. Each
// open stage that has deals gets a column; Won and Lost are collapsed into two
// distinct terminal columns (matching the design's Won/Lost lanes). The board
// component builds the actual count/sum per column from real rows.
// ---------------------------------------------------------------------------
export type BoardColumnKey = string; // a single stage, or 'won' / 'lost'

// The canonical pipeline order shown on the board (open stages first, then the
// two terminal lanes). Open stages with zero deals still render (empty lanes),
// mirroring the design's full pipeline.
export const BOARD_OPEN_STAGES = [
  'new',
  'qualified',
  'requirement_analysis',
  'proposal',
  'price_quote',
  'negotiation',
  'review',
  'payment_followup',
  'approval',
  'on_hold',
] as const;

export const DEAL_STAGE_PILL: Record<string, string> = {
  new: 'bg-info-bg text-info-text border-info-border',
  qualified: 'bg-info-bg text-info-text border-info-border',
  requirement_analysis: 'bg-accent-subtle text-accent-text border-accent-border',
  proposal: 'bg-accent-subtle text-accent-text border-accent-border',
  price_quote: 'bg-accent-subtle text-accent-text border-accent-border',
  negotiation: 'bg-accent-subtle text-accent-text border-accent-border',
  review: 'bg-accent-subtle text-accent-text border-accent-border',
  payment_followup: 'bg-warning-bg text-warning-text border-warning-border',
  approval: 'bg-info-bg text-info-text border-info-border',
  closed_won: 'bg-success-bg text-success-text border-success-border',
  closed_lost: 'bg-danger-bg text-danger-text border-danger-border',
  on_hold: 'bg-warning-bg text-warning-text border-warning-border',
  handed_over: 'bg-success-bg text-success-text border-success-border',
  lost_after_handover: 'bg-danger-bg text-danger-text border-danger-border',
  lost_no_response: 'bg-danger-bg text-danger-text border-danger-border',
  lost_not_fit: 'bg-danger-bg text-danger-text border-danger-border',
};

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
// Money formatter — read-only display of computed billing + deal_value. Numbers
// come from the DB as strings (numeric) or numbers; coerce defensively.
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

export function formatPct(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `${n}%`;
}

// ---------------------------------------------------------------------------
// Compact money for board column sums + deal cards (e.g. "$1.2M", "₹18.0L").
// INR uses the lakh/crore scale (matching the design); other currencies use the
// SI K/M/B compact scale. Falls back to the plain formatter for small values.
// ---------------------------------------------------------------------------
export function formatMoneyCompact(
  value: string | number | null | undefined,
  currency?: string | null,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return '—';
  const code = (currency ?? 'USD').toUpperCase();
  const abs = Math.abs(n);

  if (code === 'INR') {
    if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
    if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
    if (abs >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
    return `₹${n.toFixed(0)}`;
  }

  let sym = '';
  try {
    sym =
      new Intl.NumberFormat(undefined, { style: 'currency', currency: code })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? `${code} `;
  } catch {
    sym = `${code} `;
  }
  if (abs >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}K`;
  return `${sym}${n.toFixed(0)}`;
}

// Compact relative-day formatter for deal-card "expected close" / last-activity
// chips. Returns "—" on null/invalid.
export function formatDateShort(
  value: string | Date | null | undefined,
): string {
  if (value == null || value === '') return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
