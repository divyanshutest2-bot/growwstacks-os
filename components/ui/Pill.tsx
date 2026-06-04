import {
  STATUS_PILL,
  STATUS_LABEL,
  RATING_BADGE,
  RATING_LABEL,
} from '@/lib/ui';

const PILL_BASE =
  'inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium leading-tight';

/** StatusPill — contact_status pill, token-backed per status family. */
export function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status) {
    return (
      <span
        data-testid="status-pill"
        className={`${PILL_BASE} bg-subtle text-ink-tertiary border-border-subtle`}
      >
        —
      </span>
    );
  }
  const cls = STATUS_PILL[status] ?? 'bg-subtle text-ink-secondary border-border-subtle';
  return (
    <span data-testid="status-pill" className={`${PILL_BASE} ${cls}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** RatingBadge — contact_rating badge, token-backed per rating family. */
export function RatingBadge({ rating }: { rating: string | null | undefined }) {
  if (!rating) {
    return (
      <span
        data-testid="rating-badge"
        className={`${PILL_BASE} bg-subtle text-ink-tertiary border-border-subtle`}
      >
        Unrated
      </span>
    );
  }
  const cls = RATING_BADGE[rating] ?? 'bg-subtle text-ink-secondary border-border-subtle';
  return (
    <span data-testid="rating-badge" className={`${PILL_BASE} ${cls}`}>
      {RATING_LABEL[rating] ?? rating}
    </span>
  );
}
