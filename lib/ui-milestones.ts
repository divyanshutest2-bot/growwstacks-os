// lib/ui-milestones.ts — Milestones presentation maps (tokens-only).
//
// Every pill value is a Tailwind utility class backed by a token in
// design/tokens.json. NO hex, NO px, NO arbitrary values. Mirrors lib/ui-projects.ts
// but scoped to milestone-specific enums so it doesn't collide with shared lib/ui.ts.

// ---------------------------------------------------------------------------
// milestone_status enum (0001):
//   not_started, in_progress, in_review, on_hold, done
// Mapped onto semantic token families (info=not_started, accent=active,
// warning=review/hold, success=done).
// ---------------------------------------------------------------------------
export const MILESTONE_STATUSES = [
  'not_started',
  'in_progress',
  'in_review',
  'on_hold',
  'done',
] as const;

export const MILESTONE_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  in_review: 'In review',
  on_hold: 'On hold',
  done: 'Done',
};

// Status → dot color var() for the design's clickable status pill + popover
// (Milestone Detail.html STATUSES). Same family mapping as the pill classes.
export const MILESTONE_STATUS_DOT: Record<string, string> = {
  not_started: 'var(--n-400)',
  in_progress: 'var(--iris-500)',
  in_review: 'var(--sky-500)',
  on_hold: 'var(--amber-500)',
  done: 'var(--green-500)',
};

export const MILESTONE_STATUS_PILL: Record<string, string> = {
  not_started: 'bg-info-bg text-info-text border-info-border',
  in_progress: 'bg-accent-subtle text-accent-text border-accent-border',
  in_review: 'bg-warning-bg text-warning-text border-warning-border',
  on_hold: 'bg-warning-bg text-warning-text border-warning-border',
  done: 'bg-success-bg text-success-text border-success-border',
};

// ---------------------------------------------------------------------------
// milestone_members.role — pm | developer (CHECK constraint, 0003).
// ---------------------------------------------------------------------------
export const MILESTONE_MEMBER_ROLES = ['pm', 'developer'] as const;

export const MILESTONE_MEMBER_ROLE_LABEL: Record<string, string> = {
  pm: 'PM',
  developer: 'Developer',
};

export const MILESTONE_MEMBER_ROLE_PILL: Record<string, string> = {
  pm: 'bg-accent-subtle text-accent-text border-accent-border',
  developer: 'bg-info-bg text-info-text border-info-border',
};

// ---------------------------------------------------------------------------
// schedule_state coloring — fn_schedule_state returns free text like
// 'Delivered', 'Overdue 5d', 'Due in 3d', 'On track'. Color by prefix.
// ---------------------------------------------------------------------------
export function scheduleStateClass(state: string | null | undefined): string {
  if (!state) return 'bg-subtle text-ink-secondary border-border-subtle';
  if (state.startsWith('Overdue'))
    return 'bg-danger-bg text-danger-text border-danger-border';
  if (state.startsWith('Due in'))
    return 'bg-warning-bg text-warning-text border-warning-border';
  if (state === 'Delivered')
    return 'bg-success-bg text-success-text border-success-border';
  return 'bg-info-bg text-info-text border-info-border'; // On track
}

// ---------------------------------------------------------------------------
// Money formatter — read-only display of computed billing. Numbers come from the
// DB as strings (numeric) or numbers; coerce defensively. (Same impl as projects.)
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
    return `${n.toLocaleString()} ${code}`.trim();
  }
}

// ---------------------------------------------------------------------------
// task presentation (for the milestone-detail center Tasks list). task_status
// (0001): todo | in_progress | blocked | in_review | done | lost. priority:
// low | medium | high. Kept here so the milestone cockpit stays self-contained.
// ---------------------------------------------------------------------------
export const TASK_STATUS_LABEL: Record<string, string> = {
  todo: 'To-do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  in_review: 'In review',
  done: 'Done',
  lost: 'Lost',
};

export const TASK_STATUS_DOT: Record<string, string> = {
  todo: 'var(--n-400)',
  in_progress: 'var(--iris-500)',
  blocked: 'var(--red-500)',
  in_review: 'var(--sky-500)',
  done: 'var(--green-500)',
  lost: 'var(--n-400)',
};

export const TASK_PRIORITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

// Priority → text color var() (High=danger, Medium=warning, Low=muted) per the
// Milestone Detail.html prio() helper.
export const TASK_PRIORITY_COLOR: Record<string, string> = {
  high: 'var(--color-danger-text)',
  medium: 'var(--color-warning-text)',
  low: 'var(--color-text-tertiary)',
};

// ---------------------------------------------------------------------------
// test presentation. test_type (0001): developer | uat. outcome: pass | fail.
// ---------------------------------------------------------------------------
export const TEST_TYPE_LABEL: Record<string, string> = {
  developer: 'DEV',
  uat: 'UAT',
};

export function formatPct(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `${n}%`;
}
