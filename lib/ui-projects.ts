// lib/ui-projects.ts — Projects presentation maps (tokens-only).
//
// Every pill value is a Tailwind utility class backed by a token in
// design/tokens.json. NO hex, NO px, NO arbitrary values. Mirrors lib/ui-deals.ts
// but scoped to project-specific enums so it doesn't collide with shared lib/ui.ts.

// ---------------------------------------------------------------------------
// project_status enum (0001):
//   upcoming, in_progress, client_pending, on_hold, payment_pending, handover,
//   completed, internal, lost
// Mapped onto semantic token families (info=upcoming/pending, accent=active,
// warning=hold/handover, success=completed, danger=lost, subtle=internal).
// ---------------------------------------------------------------------------
export const PROJECT_STATUSES = [
  'upcoming',
  'in_progress',
  'client_pending',
  'on_hold',
  'payment_pending',
  'handover',
  'completed',
  'internal',
  'lost',
] as const;

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  upcoming: 'Upcoming',
  in_progress: 'In progress',
  client_pending: 'Client pending',
  on_hold: 'On hold',
  payment_pending: 'Payment pending',
  handover: 'Handover',
  completed: 'Completed',
  internal: 'Internal',
  lost: 'Lost',
};

export const PROJECT_STATUS_PILL: Record<string, string> = {
  upcoming: 'bg-info-bg text-info-text border-info-border',
  in_progress: 'bg-accent-subtle text-accent-text border-accent-border',
  client_pending: 'bg-info-bg text-info-text border-info-border',
  on_hold: 'bg-warning-bg text-warning-text border-warning-border',
  payment_pending: 'bg-warning-bg text-warning-text border-warning-border',
  handover: 'bg-warning-bg text-warning-text border-warning-border',
  completed: 'bg-success-bg text-success-text border-success-border',
  internal: 'bg-subtle text-ink-secondary border-border-subtle',
  lost: 'bg-danger-bg text-danger-text border-danger-border',
};

// ---------------------------------------------------------------------------
// project_members.role — pm | developer (CHECK constraint, 0003).
// ---------------------------------------------------------------------------
export const PROJECT_MEMBER_ROLES = ['pm', 'developer'] as const;

export const PROJECT_MEMBER_ROLE_LABEL: Record<string, string> = {
  pm: 'PM',
  developer: 'Developer',
};

export const PROJECT_MEMBER_ROLE_PILL: Record<string, string> = {
  pm: 'bg-accent-subtle text-accent-text border-accent-border',
  developer: 'bg-info-bg text-info-text border-info-border',
};

// ---------------------------------------------------------------------------
// Related-list status labels — milestone_status / task_status enums (0001).
// Project-scoped so the Projects cockpit can label its milestone/task delivery
// rows without importing the milestones/tasks UI files (parallel-agent safety).
// ---------------------------------------------------------------------------
export const MILESTONE_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  in_review: 'In review',
  on_hold: 'On hold',
  done: 'Done',
};

export const TASK_LABELS: Record<string, string> = {
  upcoming: 'Upcoming',
  waiting_for_client: 'Waiting on client',
  waiting_to_start: 'Waiting to start',
  todo: 'To-do',
  in_progress: 'In progress',
  visibility_check: 'Visibility check',
  qa_review: 'QA review',
  client_review: 'Client review',
  client_pending: 'Client pending',
  internal_action: 'Internal action',
  stuck: 'Stuck',
  on_hold: 'On hold',
  done: 'Done',
  lost: 'Lost',
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
// DB as strings (numeric) or numbers; coerce defensively. (Same impl as deals.)
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

export function formatPct(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `${n}%`;
}
