'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createProject } from '@/lib/actions/projects';
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from '@/lib/ui-projects';
import type { DealPickerOption } from '@/lib/actions/projects';

// CreateProjectDialog — "New project" button + inline modal. Calls createProject
// (name REQUIRED; deal_id OPTIONAL — internal projects have none). Creation is
// admin/pm only (RLS); on success routes to the new detail page. contact_id /
// company_id are NOT set here (trigger-cached from the deal).
export function CreateProjectDialog({ deals }: { deals: DealPickerOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [dealId, setDealId] = useState('');
  const [status, setStatus] = useState<string>('upcoming');
  const [estHours, setEstHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName('');
    setDealId('');
    setStatus('upcoming');
    setEstHours('');
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const created = (await createProject({
          name,
          deal_id: dealId || null,
          status,
          estimated_hours: estHours ? Number(estHours) : null,
        })) as { id: string };
        setOpen(false);
        reset();
        router.push(`/projects/${created.id}`);
        router.refresh();
      } catch {
        setError(
          'Could not create the project. Only admins and PMs can create projects.',
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
        data-testid="project-create-btn"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover"
      >
        New project
      </button>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6">
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-lg">
            <h2 className="font-display text-h3 font-bold tracking-tight text-ink">
              New project
            </h2>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-ink" htmlFor="np-name">
                Name
              </label>
              <input
                id="np-name"
                data-testid="create-project-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldCls}
                placeholder="Acme Corp Website Redesign"
              />

              <label className="text-sm font-medium text-ink" htmlFor="np-deal">
                Deal (optional — leave blank for an internal project)
              </label>
              <select
                id="np-deal"
                data-testid="create-project-deal"
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                className={fieldCls}
              >
                <option value="">Internal (no deal)</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.display_id})
                  </option>
                ))}
              </select>

              <label
                className="text-sm font-medium text-ink"
                htmlFor="np-status"
              >
                Status
              </label>
              <select
                id="np-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldCls}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>

              <label className="text-sm font-medium text-ink" htmlFor="np-hours">
                Estimated hours
              </label>
              <input
                id="np-hours"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={estHours}
                onChange={(e) => setEstHours(e.target.value)}
                className={fieldCls}
                placeholder="0.0"
              />

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
