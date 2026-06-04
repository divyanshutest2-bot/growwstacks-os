'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { setPaymentStatus } from '@/lib/actions/payments';
import { PAYMENT_STATUS_LABEL } from '@/lib/ui-payments';

// StatusControl — non-confirm status transitions (due / overdue / client_paid /
// received) driven through setPaymentStatus. This is SEPARATE from the confirm
// gate: 'confirmed' / 'in_team_accounts' are NOT offered here — those go through
// ConfirmButton so the finance gate stays the single, legible confirm path.
//
// RLS still independently gates every transition (payments_update USING admin/pm/
// finance). We render this only for roles that can transition status; the DB is the
// boundary regardless. It also serves the smoke test's RESET-to-'due' path.
const TRANSITION_OPTIONS = [
  'due',
  'overdue',
  'client_paid',
  'received',
] as const;

export function StatusControl({
  paymentId,
  status,
}: {
  paymentId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [val, setVal] = useState(status);
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');

  function change(next: string) {
    setVal(next);
    setState('idle');
    startTransition(async () => {
      try {
        await setPaymentStatus(paymentId, next);
        setState('saved');
        router.refresh();
      } catch {
        setState('error');
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
        Set status
      </span>
      <select
        data-testid="status-control"
        value={TRANSITION_OPTIONS.includes(val as (typeof TRANSITION_OPTIONS)[number]) ? val : ''}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast focus:border-border-focus focus:shadow-focus disabled:opacity-60"
      >
        {/* If the current status is confirm-gated, show it as a disabled hint. */}
        {!TRANSITION_OPTIONS.includes(
          val as (typeof TRANSITION_OPTIONS)[number],
        ) && (
          <option value="" disabled>
            {PAYMENT_STATUS_LABEL[val] ?? val}
          </option>
        )}
        {TRANSITION_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {PAYMENT_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {state === 'saved' && (
        <span
          data-testid="status-control-state"
          className="text-xs text-success-text"
        >
          Status updated.
        </span>
      )}
      {state === 'error' && (
        <span
          data-testid="status-control-state"
          className="text-xs text-danger-text"
        >
          Status change refused.
        </span>
      )}
    </div>
  );
}
