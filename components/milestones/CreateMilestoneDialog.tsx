'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { createMilestone } from '@/lib/actions/milestones';
import { MILESTONE_STATUSES, MILESTONE_STATUS_LABEL } from '@/lib/ui-milestones';
import type { ProjectPickerOption } from '@/lib/actions/milestones';

// CreateMilestoneDialog — "New milestone" button + inline modal. Calls
// createMilestone (name REQUIRED; project_id REQUIRED — every milestone hangs off a
// project). Creation is admin/pm only (RLS); on success routes to the new detail
// page. display_id (M#) is trigger-assigned; contact_id / company_id are
// trigger-cached from the project (NOT set here).
export function CreateMilestoneDialog({
  projects,
}: {
  projects: ProjectPickerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<string>('not_started');
  const [estHours, setEstHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName('');
    setProjectId('');
    setStatus('not_started');
    setEstHours('');
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!projectId) {
      setError('Pick a project — every milestone belongs to a project.');
      return;
    }
    startTransition(async () => {
      try {
        const created = (await createMilestone({
          name,
          project_id: projectId,
          status,
          estimated_hours: estHours ? Number(estHours) : null,
        })) as { id: string };
        setOpen(false);
        reset();
        router.push(`/milestones/${created.id}`);
        router.refresh();
      } catch {
        setError(
          'Could not create the milestone. Only admins and PMs can create milestones.',
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
        data-testid="milestone-create-btn"
        onClick={() => setOpen(true)}
        className="btn btn-primary"
      >
        <Plus size={16} />
        New milestone
      </button>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6">
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-lg">
            <h2 className="font-display text-h3 font-bold tracking-tight text-ink">
              New milestone
            </h2>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-ink" htmlFor="nm-name">
                Name
              </label>
              <input
                id="nm-name"
                data-testid="create-milestone-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldCls}
                placeholder="Discovery & Requirements"
              />

              <label
                className="text-sm font-medium text-ink"
                htmlFor="nm-project"
              >
                Project (required)
              </label>
              <select
                id="nm-project"
                data-testid="create-milestone-project"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={fieldCls}
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.display_id})
                  </option>
                ))}
              </select>

              <label
                className="text-sm font-medium text-ink"
                htmlFor="nm-status"
              >
                Status
              </label>
              <select
                id="nm-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldCls}
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MILESTONE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>

              <label className="text-sm font-medium text-ink" htmlFor="nm-hours">
                Estimated hours
              </label>
              <input
                id="nm-hours"
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
                  disabled={pending || !name.trim() || !projectId}
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
