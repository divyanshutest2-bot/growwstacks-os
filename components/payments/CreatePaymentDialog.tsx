'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createPayment } from '@/lib/actions/payments';
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABEL,
  SALES_INSERTABLE_STATUSES,
} from '@/lib/ui-payments';
// (SALES_INSERTABLE_STATUSES is sourced from ui-payments, NOT the 'use server'
//  actions module — only async fns may be exported from a server-actions file.)
import type { DealPickerOption } from '@/lib/actions/payments';

// CreatePaymentDialog — "New payment" button + inline modal. Calls createPayment
// (deal_id + amount + currency REQUIRED — a payment must hang off a deal); on
// success routes to the new detail page. Not an edit form — creation is a single
// explicit action, distinct from field auto-save. contact_id is NOT set here
// (trigger-cached from the deal). display_id is trigger-assigned.
//
// 🚨 Sales may only create with status 'due' or 'client_paid'. The status picker
//    is restricted by role here for a clean UX; RLS payments_insert ALSO enforces
//    it at the DB layer — a sales user cannot insert a confirmed payment even if
//    the client were tampered with.
export function CreatePaymentDialog({
  deals,
  role,
}: {
  deals: DealPickerOption[];
  role: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dealId, setDealId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [status, setStatus] = useState<string>('due');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Sales is restricted to 'due'/'client_paid'; everyone else gets all statuses.
  const isSales = role === 'sales';
  const statusOptions = isSales
    ? (SALES_INSERTABLE_STATUSES as readonly string[])
    : PAYMENT_STATUSES;

  function reset() {
    setDealId('');
    setAmount('');
    setCurrency('USD');
    setStatus('due');
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!dealId) {
      setError('Pick a deal — a payment must belong to a deal.');
      return;
    }
    if (!amount) {
      setError('Enter an amount.');
      return;
    }
    startTransition(async () => {
      try {
        const created = (await createPayment({
          deal_id: dealId,
          amount: Number(amount),
          currency: currency || 'USD',
          status: status as (typeof PAYMENT_STATUSES)[number],
        })) as { id: string };
        setOpen(false);
        reset();
        router.push(`/payments/${created.id}`);
        router.refresh();
      } catch {
        setError(
          'Could not create the payment. Sales may only create due / client-paid payments — confirmed payments require finance.',
        );
      }
    });
  }

  const fieldCls =
    'w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast focus:border-border-focus focus:shadow-focus';

  return (
    <>
      <button
        type="button"
        data-testid="payment-create-btn"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover"
      >
        New payment
      </button>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6">
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-lg">
            <h2 className="font-display text-h3 font-bold tracking-tight text-ink">
              New payment
            </h2>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-ink" htmlFor="np-deal">
                Deal
              </label>
              <select
                id="np-deal"
                data-testid="create-payment-deal"
                required
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                className={fieldCls}
              >
                <option value="">Select a deal…</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.display_id})
                  </option>
                ))}
              </select>

              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label
                    className="text-sm font-medium text-ink"
                    htmlFor="np-amount"
                  >
                    Amount
                  </label>
                  <input
                    id="np-amount"
                    data-testid="create-payment-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={fieldCls}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex w-24 flex-col gap-1">
                  <label
                    className="text-sm font-medium text-ink"
                    htmlFor="np-currency"
                  >
                    Currency
                  </label>
                  <input
                    id="np-currency"
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className={fieldCls}
                    placeholder="USD"
                  />
                </div>
              </div>

              <label
                className="text-sm font-medium text-ink"
                htmlFor="np-status"
              >
                Status
              </label>
              <select
                id="np-status"
                data-testid="create-payment-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldCls}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {PAYMENT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              {isSales && (
                <p className="text-xs text-ink-tertiary">
                  Sales can create Due or Client-paid payments only. Confirming is
                  a finance action.
                </p>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger-text"
                >
                  {error}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="rounded-md border border-border-subtle bg-surface px-4 py-2 text-sm text-ink-secondary transition-colors duration-fast hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !dealId || !amount}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60"
                >
                  {pending ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
