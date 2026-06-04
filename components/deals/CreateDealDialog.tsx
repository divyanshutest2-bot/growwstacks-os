'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createDeal } from '@/lib/actions/deals';
import { DEAL_STAGES, DEAL_STAGE_LABEL } from '@/lib/ui-deals';
import type { ContactPickerOption } from '@/lib/actions/deals';

// CreateDealDialog — "New deal" button + inline modal. Calls createDeal (name +
// contact_id REQUIRED — a deal must hang off a contact); on success routes to
// the new detail page. Not an edit form — creation is a single explicit action,
// distinct from field auto-save. company_id is NOT set here (trigger-cached).
export function CreateDealDialog({
  contacts,
}: {
  contacts: ContactPickerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [contactId, setContactId] = useState('');
  const [stage, setStage] = useState<string>('new');
  const [dealValue, setDealValue] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName('');
    setContactId('');
    setStage('new');
    setDealValue('');
    setCurrency('USD');
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!contactId) {
      setError('Pick a contact — a deal must belong to a contact.');
      return;
    }
    startTransition(async () => {
      try {
        const created = (await createDeal({
          name,
          contact_id: contactId,
          stage,
          deal_value: dealValue ? Number(dealValue) : null,
          currency: currency || null,
        })) as { id: string };
        setOpen(false);
        reset();
        router.push(`/deals/${created.id}`);
        router.refresh();
      } catch {
        setError('Could not create the deal. Check the fields and try again.');
      }
    });
  }

  const fieldCls =
    'w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast focus:border-border-focus focus:shadow-focus';

  return (
    <>
      <button
        type="button"
        data-testid="deal-create-btn"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover"
      >
        New deal
      </button>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6">
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-lg">
            <h2 className="font-display text-h3 font-bold tracking-tight text-ink">
              New deal
            </h2>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-ink" htmlFor="nd-name">
                Name
              </label>
              <input
                id="nd-name"
                data-testid="create-deal-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldCls}
                placeholder="Acme Corp - Website Redesign"
              />

              <label
                className="text-sm font-medium text-ink"
                htmlFor="nd-contact"
              >
                Contact
              </label>
              <select
                id="nd-contact"
                data-testid="create-deal-contact"
                required
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className={fieldCls}
              >
                <option value="">Select a contact…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.display_id})
                  </option>
                ))}
              </select>

              <label className="text-sm font-medium text-ink" htmlFor="nd-stage">
                Stage
              </label>
              <select
                id="nd-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className={fieldCls}
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {DEAL_STAGE_LABEL[s]}
                  </option>
                ))}
              </select>

              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label
                    className="text-sm font-medium text-ink"
                    htmlFor="nd-value"
                  >
                    Deal value
                  </label>
                  <input
                    id="nd-value"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                    className={fieldCls}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex w-24 flex-col gap-1">
                  <label
                    className="text-sm font-medium text-ink"
                    htmlFor="nd-currency"
                  >
                    Currency
                  </label>
                  <input
                    id="nd-currency"
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className={fieldCls}
                    placeholder="USD"
                  />
                </div>
              </div>

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
                  disabled={pending || !name.trim() || !contactId}
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
