// lib/ui.ts — shared presentation maps (tokens-only).
//
// Every value here is a Tailwind utility class backed by a token in
// design/tokens.json. NO hex, NO px, NO arbitrary values. These maps translate
// DB enum values → token-backed class strings so the JSX stays declarative.

// ---------------------------------------------------------------------------
// contact_status → pill classes. Enum (0001): prospect | active_client |
// partner | on_hold | churned. Mapped onto semantic token families.
// ---------------------------------------------------------------------------
export const STATUS_PILL: Record<string, string> = {
  prospect: 'bg-info-bg text-info-text border-info-border',
  active_client: 'bg-success-bg text-success-text border-success-border',
  partner: 'bg-accent-subtle text-accent-text border-accent-border',
  on_hold: 'bg-warning-bg text-warning-text border-warning-border',
  churned: 'bg-danger-bg text-danger-text border-danger-border',
};

export const STATUS_LABEL: Record<string, string> = {
  prospect: 'Prospect',
  active_client: 'Active client',
  partner: 'Partner',
  on_hold: 'On hold',
  churned: 'Churned',
};

export const CONTACT_STATUSES = [
  'prospect',
  'active_client',
  'partner',
  'on_hold',
  'churned',
] as const;

// ---------------------------------------------------------------------------
// contact_rating → badge classes. Enum (0001): great | good | average | bad →
// success / info / warning / danger token families (per the build spec).
// ---------------------------------------------------------------------------
export const RATING_BADGE: Record<string, string> = {
  great: 'bg-success-bg text-success-text border-success-border',
  good: 'bg-info-bg text-info-text border-info-border',
  average: 'bg-warning-bg text-warning-text border-warning-border',
  bad: 'bg-danger-bg text-danger-text border-danger-border',
};

export const RATING_LABEL: Record<string, string> = {
  great: 'Great',
  good: 'Good',
  average: 'Average',
  bad: 'Bad',
};

export const CONTACT_RATINGS = ['great', 'good', 'average', 'bad'] as const;

// ---------------------------------------------------------------------------
// company_type → pill classes. Enum (0001): prospect | client | partner |
// past_client. Mapped onto the same semantic token families as StatusPill so
// the shared <StatusPill> renders company type without modification.
// ---------------------------------------------------------------------------
export const COMPANY_TYPE_PILL: Record<string, string> = {
  prospect: 'bg-info-bg text-info-text border-info-border',
  client: 'bg-success-bg text-success-text border-success-border',
  partner: 'bg-accent-subtle text-accent-text border-accent-border',
  past_client: 'bg-warning-bg text-warning-text border-warning-border',
};

export const COMPANY_TYPE_LABEL: Record<string, string> = {
  prospect: 'Prospect',
  client: 'Client',
  partner: 'Partner',
  past_client: 'Past client',
};

export const COMPANY_TYPES = [
  'prospect',
  'client',
  'partner',
  'past_client',
] as const;

// ---------------------------------------------------------------------------
// company_size enum (0001).
// ---------------------------------------------------------------------------
export const COMPANY_SIZES = ['1-10', '11-50', '50-200', '200+'] as const;

// ---------------------------------------------------------------------------
// platform (main_platform) enum (0001).
// ---------------------------------------------------------------------------
export const PLATFORMS = [
  'whatsapp',
  'teams',
  'slack',
  'email',
  'upwork',
  'other',
] as const;

// ---------------------------------------------------------------------------
// lead_source enum (0001).
// ---------------------------------------------------------------------------
export const LEAD_SOURCES = [
  'upwork_bid',
  'upwork_direct',
  'website_form',
  'call',
  'inquiry',
  'referral',
  'make_opportunity',
  'open_source_linkedin',
] as const;

// Human labels for the list's "Lead source" column.
export const LEAD_SOURCE_LABEL: Record<string, string> = {
  upwork_bid: 'Upwork Bid',
  upwork_direct: 'Upwork Direct',
  website_form: 'Website Form',
  call: 'Call',
  inquiry: 'Inquiry',
  referral: 'Referral',
  make_opportunity: 'Make Opportunity',
  open_source_linkedin: 'LinkedIn',
};

// ---------------------------------------------------------------------------
// conversation_channel → left-border accent class. There is no per-channel
// Tailwind color token (channels live as primitives only), so we color the
// channel LABEL with the closest semantic family and keep the bubble neutral.
// ---------------------------------------------------------------------------
export const CHANNEL_TEXT: Record<string, string> = {
  whatsapp: 'text-success-text',
  slack: 'text-accent-text',
  gmail: 'text-danger-text',
  outlook: 'text-info-text',
  upwork: 'text-success-text',
  teams: 'text-accent-text',
  phone: 'text-ink-secondary',
  zoom: 'text-info-text',
  google_meet: 'text-info-text',
  fireflies: 'text-warning-text',
};

// ---------------------------------------------------------------------------
// ai_insights: sentiment → text class; kind → label.
// ---------------------------------------------------------------------------
export const SENTIMENT_TEXT: Record<string, string> = {
  positive: 'text-ai-positive',
  neutral: 'text-ai-neutral',
  risk: 'text-ai-risk',
};

export const INSIGHT_KIND_LABEL: Record<string, string> = {
  blocker: 'Blocker',
  highlight: 'Highlight',
};

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * relativeTime — compact "2h ago" / "3d ago" / "5mo ago" for the list's
 * Last-activity column. Falls back to "—" when null/invalid.
 */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  const t = d.getTime();
  if (Number.isNaN(t)) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

/**
 * formatINRLakhs — "₹18.0L" / "₹1.2Cr" style for lifetime value. Accepts the
 * Neon numeric (string | number). Returns "—" for null / zero.
 */
export function formatINRLakhs(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

// Stable avatar background, picked by hashing an id over the design's six-color
// set (iris/sky/green/amber/red/neutral-600). Returns a CSS var() string so the
// inline style stays tokens-only.
const AVATAR_BG = [
  'var(--iris-600)',
  'var(--sky-600)',
  'var(--green-600)',
  'var(--amber-500)',
  'var(--red-500)',
  'var(--n-600)',
];

export function avatarBg(id: string | null | undefined): string {
  if (!id) return AVATAR_BG[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}

// User-status → owner-stack status-dot color var. Enum: active | away | left_org.
export const USER_STATUS_DOT: Record<string, string> = {
  active: 'var(--color-status-active)',
  away: 'var(--color-status-away)',
  left_org: 'var(--color-status-left)',
};

// contact_status → status-pill dot color var (design's STATUS_DOT map).
export const STATUS_DOT: Record<string, string> = {
  active_client: 'var(--iris-500)',
  prospect: 'var(--sky-500)',
  partner: 'var(--green-500)',
  on_hold: 'var(--amber-500)',
  churned: 'var(--n-400)',
};

// company_type → status-pill dot color var. Enum (0001): prospect | client |
// partner | past_client. Mirrors the design's STATUS_DOT mapping for companies.
export const COMPANY_TYPE_DOT: Record<string, string> = {
  client: 'var(--iris-500)',
  prospect: 'var(--sky-500)',
  partner: 'var(--green-500)',
  past_client: 'var(--n-400)',
};
