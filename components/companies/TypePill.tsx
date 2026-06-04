import { COMPANY_TYPE_PILL, COMPANY_TYPE_LABEL } from '@/lib/ui';

const PILL_BASE =
  'inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium leading-tight';

// TypePill — company_type pill, token-backed per type family. Mirrors the
// contacts StatusPill shape and emits the SAME `status-pill` testid (per the
// testid contract: status-pill is used for the company type). The generic
// ui/StatusPill is bound to contact_status enum values, so companies use this
// type-specific variant rather than modifying the shared component.
export function TypePill({ type }: { type: string | null | undefined }) {
  if (!type) {
    return (
      <span
        data-testid="status-pill"
        className={`${PILL_BASE} bg-subtle text-ink-tertiary border-border-subtle`}
      >
        —
      </span>
    );
  }
  const cls =
    COMPANY_TYPE_PILL[type] ?? 'bg-subtle text-ink-secondary border-border-subtle';
  return (
    <span data-testid="status-pill" className={`${PILL_BASE} ${cls}`}>
      {COMPANY_TYPE_LABEL[type] ?? type}
    </span>
  );
}
