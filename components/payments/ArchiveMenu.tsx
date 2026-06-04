'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { archivePayment } from '@/lib/actions/payments';

// ArchiveMenu (payments) — the ONLY destructive affordance, and it is ARCHIVE, not
// delete (CLAUDE.md rule 4). Behind a kebab menu + an explicit confirm. Calls
// archivePayment (sets archived_at); on success returns to the list.
export function ArchiveMenu({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      await archivePayment(paymentId);
      router.push('/payments');
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Payment actions"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-surface text-ink-secondary transition-colors duration-fast hover:bg-hover"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-border-subtle bg-surface p-1 shadow-md">
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
              setOpen(false);
            }}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-danger-text transition-colors duration-fast hover:bg-danger-bg"
          >
            Archive payment
          </button>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6">
          <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface p-6 shadow-lg">
            <h2 className="font-display text-h3 font-bold text-ink">
              Archive this payment?
            </h2>
            <p className="mt-2 text-sm text-ink-secondary">
              The payment is hidden from lists but never deleted. It can be
              restored later.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-border-subtle bg-surface px-4 py-2 text-sm text-ink-secondary transition-colors duration-fast hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={archive}
                disabled={pending}
                className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-danger-solid disabled:opacity-60"
              >
                {pending ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
