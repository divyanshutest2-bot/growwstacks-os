// lib/ui-tasks.ts — Tasks presentation maps (tokens-only).
//
// Every pill value is a Tailwind utility class backed by a token in
// design/tokens.json. NO hex, NO px, NO arbitrary values. Mirrors lib/ui-projects.ts
// but scoped to task-specific enums so it doesn't collide with shared lib/ui.ts.

// ---------------------------------------------------------------------------
// task_status enum (0001):
//   upcoming, waiting_for_client, waiting_to_start, todo, in_progress,
//   visibility_check, qa_review, client_review, client_pending, internal_action,
//   stuck, on_hold, done, lost
// Mapped onto semantic token families (info=queued/waiting, accent=active work,
// warning=hold/review, success=done, danger=stuck/lost, subtle=internal).
// ---------------------------------------------------------------------------
export const TASK_STATUSES = [
  'upcoming',
  'waiting_for_client',
  'waiting_to_start',
  'todo',
  'in_progress',
  'visibility_check',
  'qa_review',
  'client_review',
  'client_pending',
  'internal_action',
  'stuck',
  'on_hold',
  'done',
  'lost',
] as const;

export const TASK_STATUS_LABEL: Record<string, string> = {
  upcoming: 'Upcoming',
  waiting_for_client: 'Waiting for client',
  waiting_to_start: 'Waiting to start',
  todo: 'To do',
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

// task_status → status-pill DOT color var (the cockpit's clickable .statuspill
// uses a colored dot, mirroring the design's STATUSES map). Families: info/queued
// (sky), active work (iris/accent), review/hold (amber), done (green), stuck/lost
// (red), internal/todo (neutral).
export const TASK_STATUS_DOT: Record<string, string> = {
  upcoming: 'var(--sky-500)',
  waiting_for_client: 'var(--sky-500)',
  waiting_to_start: 'var(--sky-500)',
  todo: 'var(--n-400)',
  in_progress: 'var(--iris-500)',
  visibility_check: 'var(--amber-500)',
  qa_review: 'var(--sky-500)',
  client_review: 'var(--amber-500)',
  client_pending: 'var(--sky-500)',
  internal_action: 'var(--n-400)',
  stuck: 'var(--red-500)',
  on_hold: 'var(--amber-500)',
  done: 'var(--green-500)',
  lost: 'var(--red-500)',
};

export const TASK_STATUS_PILL: Record<string, string> = {
  upcoming: 'bg-info-bg text-info-text border-info-border',
  waiting_for_client: 'bg-info-bg text-info-text border-info-border',
  waiting_to_start: 'bg-info-bg text-info-text border-info-border',
  todo: 'bg-subtle text-ink-secondary border-border-subtle',
  in_progress: 'bg-accent-subtle text-accent-text border-accent-border',
  visibility_check: 'bg-warning-bg text-warning-text border-warning-border',
  qa_review: 'bg-warning-bg text-warning-text border-warning-border',
  client_review: 'bg-warning-bg text-warning-text border-warning-border',
  client_pending: 'bg-info-bg text-info-text border-info-border',
  internal_action: 'bg-subtle text-ink-secondary border-border-subtle',
  stuck: 'bg-danger-bg text-danger-text border-danger-border',
  on_hold: 'bg-warning-bg text-warning-text border-warning-border',
  done: 'bg-success-bg text-success-text border-success-border',
  lost: 'bg-danger-bg text-danger-text border-danger-border',
};

// ---------------------------------------------------------------------------
// priority enum (0001): low | medium | high.
// ---------------------------------------------------------------------------
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export const TASK_PRIORITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const TASK_PRIORITY_PILL: Record<string, string> = {
  low: 'bg-subtle text-ink-secondary border-border-subtle',
  medium: 'bg-info-bg text-info-text border-info-border',
  high: 'bg-danger-bg text-danger-text border-danger-border',
};

// Priority → text color var() for the inline (non-pill) priority displays the
// design uses in the header statstrip and the left-rail meta-row ("High" in red).
export const TASK_PRIORITY_TEXT_VAR: Record<string, string> = {
  low: 'var(--color-text-secondary)',
  medium: 'var(--color-info-text)',
  high: 'var(--color-danger-text)',
};

// ---------------------------------------------------------------------------
// task_delivery_state enum (0001): not_delivered | delivered.
// ---------------------------------------------------------------------------
export const TASK_DELIVERY_STATES = ['not_delivered', 'delivered'] as const;

export const TASK_DELIVERY_STATE_LABEL: Record<string, string> = {
  not_delivered: 'Not delivered',
  delivered: 'Delivered',
};

export const TASK_DELIVERY_STATE_PILL: Record<string, string> = {
  not_delivered: 'bg-subtle text-ink-secondary border-border-subtle',
  delivered: 'bg-success-bg text-success-text border-success-border',
};

// ---------------------------------------------------------------------------
// schedule_state coloring — fn_schedule_state returns free text like
// 'Delivered', 'Overdue 5d', 'Due in 3d', 'On track'. Color by prefix. (Mirrors
// lib/ui-projects.ts scheduleStateClass.)
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
// Hours formatter — read-only display of planned/quoted hours.
// ---------------------------------------------------------------------------
export function formatHours(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `${n}h`;
}
