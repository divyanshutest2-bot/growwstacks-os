// lib/ui-users.ts — presentation maps for the Users slice (tokens-only).
//
// Every value here is a Tailwind utility class backed by a token in
// design/tokens.json. NO hex, NO px, NO arbitrary values.

// ---------------------------------------------------------------------------
// user_status (0001): active | away | left_org → StatusDot color + label.
// ---------------------------------------------------------------------------
export const USER_STATUSES = ['active', 'away', 'left_org'] as const;

export const STATUS_DOT: Record<string, string> = {
  active: 'bg-success-solid',
  away: 'bg-warning-solid',
  left_org: 'bg-ink-tertiary',
};

export const USER_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  away: 'Away',
  left_org: 'Left org',
};

// CSS-var status colors (for the design's inline-styled dots: list status dot,
// header status pill, detail avatar dot). Mirrors the prototype's SD map.
export const USER_STATUS_DOT_VAR: Record<string, string> = {
  active: 'var(--color-status-active)',
  away: 'var(--color-status-away)',
  left_org: 'var(--color-status-left)',
};

// ---------------------------------------------------------------------------
// user_role (0001): admin | pm | developer | sales | finance | viewer →
// pill classes + label. Mapped onto the shared semantic token families.
// ---------------------------------------------------------------------------
export const USER_ROLES = [
  'admin',
  'pm',
  'developer',
  'sales',
  'finance',
  'viewer',
] as const;

export const ROLE_PILL: Record<string, string> = {
  admin: 'bg-accent-subtle text-accent-text border-accent-border',
  pm: 'bg-info-bg text-info-text border-info-border',
  developer: 'bg-success-bg text-success-text border-success-border',
  sales: 'bg-warning-bg text-warning-text border-warning-border',
  finance: 'bg-info-bg text-info-text border-info-border',
  viewer: 'bg-subtle text-ink-secondary border-border-subtle',
};

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  pm: 'PM',
  developer: 'Developer',
  sales: 'Sales',
  finance: 'Finance',
  viewer: 'Viewer',
};

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

/** Format a `time` value ('HH:MM:SS' or 'HH:MM') to 'HH:MM', or '—'. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]}:${m[2]}` : value;
}

/** Format an avg rating (numeric or string) to one decimal, or '—'. */
export function formatRating(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(1);
}

/** Convert a minutes total to 'Xh Ym' (used for time-this-month), or '—'. */
export function formatMinutes(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const total = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(total) || total <= 0) return '0h';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Tech expertise (app_links proficiency, parent_type='user').
// ---------------------------------------------------------------------------
export const PROFICIENCY_LABEL: Record<string, string> = {
  expert: 'Expert',
  intermediate: 'Intermediate',
};

/**
 * Coerce a numeric/string available-hours value to a number (the neon driver
 * returns numeric columns as strings). Returns 0 for null/NaN.
 */
export function toHours(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Coerce a `date` value (Date object from neon OR a YYYY-MM-DD string) to a
 * YYYY-MM-DD string — never render a raw Date child.
 */
export function toDateStr(value: string | Date | null | undefined): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
