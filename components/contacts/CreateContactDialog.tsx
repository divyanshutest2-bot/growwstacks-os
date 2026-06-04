'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createContact } from '@/lib/actions/contacts';
import { CONTACT_STATUSES, STATUS_LABEL } from '@/lib/ui';

// CreateContactDialog — "New contact" button + inline modal. Calls createContact
// (full_name required); on success routes to the new detail page. Not an edit
// form — creation is a single explicit action, distinct from field auto-save.
export function CreateContactDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string>('prospect');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFullName('');
    setEmail('');
    setStatus('prospect');
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const created = (await createContact({
          full_name: fullName,
          email: email || null,
          status,
        })) as { id: string };
        setOpen(false);
        reset();
        router.push(`/contacts/${created.id}`);
        router.refresh();
      } catch {
        setError('Could not create the contact. Check the fields and try again.');
      }
    });
  }

  const fieldCls =
    'w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast focus:border-border-focus focus:shadow-focus';

  return (
    <>
      <button
        type="button"
        data-testid="contact-create-btn"
        onClick={() => setOpen(true)}
        className="btn btn-primary"
      >
        <Plus size={15} aria-hidden />
        New contact
      </button>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6">
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-lg">
            <h2 className="font-display text-h3 font-bold tracking-tight text-ink">
              New contact
            </h2>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-ink" htmlFor="nc-name">
                Full name
              </label>
              <input
                id="nc-name"
                data-testid="create-contact-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={fieldCls}
                placeholder="Jane Doe"
              />

              <label className="text-sm font-medium text-ink" htmlFor="nc-email">
                Email
              </label>
              <input
                id="nc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldCls}
                placeholder="jane@example.com"
              />

              <label className="text-sm font-medium text-ink" htmlFor="nc-status">
                Status
              </label>
              <select
                id="nc-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldCls}
              >
                {CONTACT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>

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
                  disabled={pending || !fullName.trim()}
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
