'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { logTaskTime } from '@/lib/actions/tasks';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// AddTimeLogForm — inline "log my own effort" row on the task cockpit. Modeled on
// AddNoteForm (useTransition + server action + Saved-via-refresh). Rendered ONLY
// for roles that can both INSERT own + read own rows back (admin, developer);
// the server action pins user_id = fn_me() regardless of anything sent here.
export function AddTimeLogForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [date, setDate] = useState(todayISO);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const mins = Number(minutes);
    if (!Number.isInteger(mins) || mins <= 0 || mins > 1440) {
      setError('Enter minutes between 1 and 1440.');
      return;
    }
    if (date && date > todayISO()) {
      setError('Date cannot be in the future.');
      return;
    }
    startTransition(async () => {
      try {
        await logTaskTime(taskId, { minutes: mins, logged_for_date: date || null });
        setMinutes('');
        setDate(todayISO());
        setOpen(false);
        router.refresh();
      } catch {
        setError('Could not log time.');
      }
    });
  }

  const fieldCls =
    'rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast placeholder:text-ink-tertiary focus:border-border-focus focus:shadow-focus';

  if (!open) {
    return (
      <button
        type="button"
        data-testid="time-log-add"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md border border-border-subtle bg-surface px-3 py-1 text-sm text-ink-secondary transition-colors duration-fast hover:bg-hover"
      >
        + Log time
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      data-testid="time-log-form"
      className="flex w-full flex-col gap-2"
    >
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          max={1440}
          required
          data-testid="time-log-minutes"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="Minutes"
          className={`${fieldCls} w-28`}
        />
        <input
          type="date"
          required
          data-testid="time-log-date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className={`${fieldCls} flex-1`}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border-subtle bg-surface px-3 py-1 text-sm text-ink-secondary transition-colors duration-fast hover:bg-hover"
        >
          Cancel
        </button>
        <button
          type="submit"
          data-testid="time-log-save"
          disabled={pending || !minutes.trim()}
          className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
