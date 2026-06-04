'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createTask } from '@/lib/actions/tasks';
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
} from '@/lib/ui-tasks';
import type { MilestonePickerOption } from '@/lib/actions/tasks';

// CreateTaskDialog — "New task" button + inline modal. Calls createTask (title +
// parent REQUIRED). The default parent is a MILESTONE (delivery task), chosen via
// the milestone picker. Creation is admin/pm only (RLS); on success routes to the
// new detail page. project_id/milestone_id/contact_id/company_id are NOT set here
// (trigger-cached from the parent milestone). display_id (T-#) is trigger-set.
export function CreateTaskDialog({
  milestones,
}: {
  milestones: MilestonePickerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [milestoneId, setMilestoneId] = useState(
    milestones[0]?.id ?? '',
  );
  const [status, setStatus] = useState<string>('todo');
  const [priority, setPriority] = useState<string>('medium');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle('');
    setMilestoneId(milestones[0]?.id ?? '');
    setStatus('todo');
    setPriority('medium');
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!milestoneId) {
      setError('Pick a milestone to create the task under.');
      return;
    }
    startTransition(async () => {
      try {
        const created = (await createTask({
          title,
          parent_type: 'milestone',
          parent_id: milestoneId,
          status,
          priority,
        })) as { id: string };
        setOpen(false);
        reset();
        router.push(`/tasks/${created.id}`);
        router.refresh();
      } catch {
        setError(
          'Could not create the task. Only admins and PMs can create tasks.',
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
        data-testid="task-create-btn"
        onClick={() => setOpen(true)}
        className="btn btn-primary"
      >
        <Plus size={15} aria-hidden />
        New task
      </button>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6">
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-lg">
            <h2 className="font-display text-h3 font-bold tracking-tight text-ink">
              New task
            </h2>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-ink" htmlFor="nt-title">
                Title
              </label>
              <input
                id="nt-title"
                data-testid="create-task-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={fieldCls}
                placeholder="Draft wireframes for homepage"
              />

              <label
                className="text-sm font-medium text-ink"
                htmlFor="nt-milestone"
              >
                Milestone (parent)
              </label>
              <select
                id="nt-milestone"
                data-testid="create-task-milestone"
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                className={fieldCls}
              >
                {milestones.length === 0 ? (
                  <option value="">No milestones available</option>
                ) : (
                  milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.display_id})
                    </option>
                  ))
                )}
              </select>

              <label className="text-sm font-medium text-ink" htmlFor="nt-status">
                Status
              </label>
              <select
                id="nt-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldCls}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>

              <label
                className="text-sm font-medium text-ink"
                htmlFor="nt-priority"
              >
                Priority
              </label>
              <select
                id="nt-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={fieldCls}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
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
                  disabled={pending || !title.trim()}
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
