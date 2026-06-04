'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createCompany } from '@/lib/actions/companies';
import { COMPANY_TYPES, COMPANY_TYPE_LABEL } from '@/lib/ui';

// CreateCompanyDialog — "New company" button + inline modal. Calls createCompany
// (name required); on success routes to the new detail page. Not an edit form —
// creation is a single explicit action, distinct from field auto-save.
export function CreateCompanyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [type, setType] = useState<string>('prospect');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName('');
    setWebsite('');
    setType('prospect');
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const created = (await createCompany({
          name,
          website: website || null,
          type,
        })) as { id: string };
        setOpen(false);
        reset();
        router.push(`/companies/${created.id}`);
        router.refresh();
      } catch {
        setError('Could not create the company. Check the fields and try again.');
      }
    });
  }

  const fieldCls =
    'w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast focus:border-border-focus focus:shadow-focus';

  return (
    <>
      <button
        type="button"
        data-testid="company-create-btn"
        onClick={() => setOpen(true)}
        className="btn btn-primary"
      >
        <Plus size={15} aria-hidden />
        New company
      </button>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6">
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-lg">
            <h2 className="font-display text-h3 font-bold tracking-tight text-ink">
              New company
            </h2>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-ink" htmlFor="nc-name">
                Name
              </label>
              <input
                id="nc-name"
                data-testid="create-company-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldCls}
                placeholder="Acme Corp"
              />

              <label className="text-sm font-medium text-ink" htmlFor="nc-website">
                Website
              </label>
              <input
                id="nc-website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className={fieldCls}
                placeholder="https://acme.example.com"
              />

              <label className="text-sm font-medium text-ink" htmlFor="nc-type">
                Type
              </label>
              <select
                id="nc-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={fieldCls}
              >
                {COMPANY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COMPANY_TYPE_LABEL[t]}
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
                  disabled={pending || !name.trim()}
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
