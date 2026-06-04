'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ShieldCheck } from 'lucide-react';

import { confirmPayment } from '@/lib/actions/payments';

// ConfirmButton — the FINANCE/ADMIN confirm gate affordance.
//
// 🚨 The keystone of the Payments slice. confirmPayment sets status='confirmed';
//    RLS payments_update WITH CHECK lets ONLY admin/finance succeed. A PM (or
//    sales) is REFUSED with 42501 — the action throws, and we render an explicit
//    `confirm-state` refusal. The payment's status is unchanged (still 'due').
//
// We only render the button for admin/finance (the roles that CAN confirm). The
// DB is still the boundary: even if the button rendered for a PM and they clicked,
// the WITH CHECK would refuse and this component would show the refusal. The role
// gate here is UX, not security (CLAUDE.md rule 1).
//
// For test coverage of the PM-cannot-confirm negative case, `forceVisible` lets a
// caller render the button regardless of role so the action can be invoked and the
// refusal asserted through the real app path.
export function ConfirmButton({
  paymentId,
  status,
  canConfirm,
  forceVisible = false,
}: {
  paymentId: string;
  status: string;
  canConfirm: boolean;
  forceVisible?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<'idle' | 'confirmed' | 'refused'>('idle');

  const alreadyConfirmed =
    status === 'confirmed' || status === 'in_team_accounts';

  function confirm() {
    setState('idle');
    startTransition(async () => {
      try {
        await confirmPayment(paymentId);
        setState('confirmed');
        router.refresh();
      } catch {
        // RLS WITH CHECK refusal (e.g. a PM) — surface it; status stays unchanged.
        setState('refused');
      }
    });
  }

  // Don't render the confirm affordance for roles that cannot confirm, UNLESS a
  // caller explicitly forces it (the PM-cannot-confirm negative-case path).
  if (!canConfirm && !forceVisible) {
    return (
      <div className="confirm-block">
        <span data-testid="confirm-state" className="confirm-hint">
          {alreadyConfirmed
            ? 'This payment is confirmed.'
            : 'Only finance or admin can confirm this payment.'}
        </span>
      </div>
    );
  }

  return (
    <div className="confirm-block">
      <button
        type="button"
        data-testid="confirm-btn"
        onClick={confirm}
        disabled={pending || alreadyConfirmed || state === 'confirmed'}
        className="btn btn-primary"
        style={{ alignSelf: 'flex-start' }}
      >
        <ShieldCheck size={16} />
        {pending
          ? 'Confirming…'
          : alreadyConfirmed || state === 'confirmed'
            ? 'Confirmed'
            : 'Confirm payment'}
      </button>

      {state === 'confirmed' && (
        <span data-testid="confirm-state" className="confirm-success">
          Payment confirmed.
        </span>
      )}
      {state === 'refused' && (
        <span data-testid="confirm-state" role="alert" className="confirm-refused">
          Confirmation refused — only finance or admin can confirm a payment. The
          status is unchanged.
        </span>
      )}
      {state === 'idle' && !alreadyConfirmed && (
        <span data-testid="confirm-state" className="confirm-hint">
          Confirming locks this payment into the finance pipeline.
        </span>
      )}
      {state === 'idle' && alreadyConfirmed && (
        <span data-testid="confirm-state" className="confirm-success">
          This payment is confirmed.
        </span>
      )}
    </div>
  );
}
