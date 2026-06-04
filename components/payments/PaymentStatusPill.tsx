'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Lock } from 'lucide-react';

import { setPaymentStatus, confirmPayment } from '@/lib/actions/payments';
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_DOT,
  PAYMENT_STATUS_PILL_STYLE,
  CONFIRM_GATED_STATUSES,
} from '@/lib/ui-payments';

// PaymentStatusPill — the design's clickable hero status pill (Payment Detail.html
// .statuspill) with a popover menu of the full payment_status lifecycle. Selecting
// a status auto-saves it — BUT the confirm-gated values ('confirmed',
// 'in_team_accounts') are FINANCE-GATED:
//   - For a non-finance/admin viewer those menu items render DISABLED with a lock
//     icon (mirroring the design's ROLE='PM' → Paid/Confirmed disabled), and a
//     "finance-gated" footnote explains why.
//   - The DB WITH CHECK is the real boundary regardless of the UI: if a confirm-
//     gated write is attempted by a non-finance role it is REFUSED (42501); the
//     pill reverts and surfaces the refusal. The role gate here is UX, not security.
//
// Routing: a confirm-gated selection ('confirmed') goes through confirmPayment so
// confirmed_by is set on the keystone path; everything else goes through
// setPaymentStatus. The pill carries data-testid="status-pill" (the testid the
// Playwright suite reads to assert the rendered status).
const GATED = new Set<string>(CONFIRM_GATED_STATUSES);

export function PaymentStatusPill({
  paymentId,
  status,
  canConfirm,
}: {
  paymentId: string;
  status: string;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(status);
  const [refused, setRefused] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Keep the rendered pill in sync if the server re-reads a different status.
  useEffect(() => setCurrent(status), [status]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  function choose(next: string) {
    setOpen(false);
    if (next === current) return;
    // A non-finance viewer cannot pick a gated status (item is disabled), but guard
    // anyway: never optimistically flip to a gated status we can't write.
    const gated = GATED.has(next);
    if (gated && !canConfirm) {
      setRefused(true);
      return;
    }
    const prev = current;
    setRefused(false);
    setCurrent(next);
    startTransition(async () => {
      try {
        if (next === 'confirmed') {
          await confirmPayment(paymentId);
        } else {
          await setPaymentStatus(paymentId, next);
        }
        router.refresh();
      } catch {
        // RLS WITH CHECK refusal (e.g. a PM) — revert and surface.
        setCurrent(prev);
        setRefused(true);
      }
    });
  }

  const style = PAYMENT_STATUS_PILL_STYLE[current] ?? {
    bg: 'var(--color-bg-subtle)',
    text: 'var(--color-text-secondary)',
    border: 'var(--color-border-subtle)',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        className="statuspill"
        data-testid="status-pill"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
      >
        <span className="dot" style={{ background: PAYMENT_STATUS_DOT[current] ?? 'var(--color-text-muted)' }} />
        <span>{PAYMENT_STATUS_LABEL[current] ?? current}</span>
        <ChevronDown size={13} />
      </span>

      {open && (
        <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0 }}>
          {PAYMENT_STATUSES.map((s) => {
            const disabled = GATED.has(s) && !canConfirm;
            return (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => choose(s)}
              >
                <span
                  className="dot"
                  style={{ background: PAYMENT_STATUS_DOT[s] ?? 'var(--color-text-muted)' }}
                />
                {PAYMENT_STATUS_LABEL[s]}
                {disabled && <Lock size={11} className="lock" />}
              </button>
            );
          })}
          {!canConfirm && (
            <div className="gate-note">Paid / Confirmed are finance-gated</div>
          )}
        </div>
      )}

      {refused && (
        <span
          data-testid="status-pill-refused"
          role="alert"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            whiteSpace: 'nowrap',
            fontSize: 11,
            color: 'var(--color-danger-text)',
            background: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 8px',
          }}
        >
          Finance-gated — only finance/admin can set this.
        </span>
      )}
    </div>
  );
}
