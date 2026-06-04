'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createTest } from '@/lib/actions/tests';

// AddTestForm — inline "record a test" row on the milestone & task cockpits.
// Modeled on AddTimeLogForm. Rendered ONLY where RLS would accept the write
// (milestone: admin/pm; task: admin/pm or a developer assigned to the task) —
// the server action + RLS are the real enforcement.
//
// NOTE: `outcome` is REQUIRED here even though tests.outcome is nullable — a
// deliberate simplification this step (record-with-result; pass/fail only). A
// pending→concluded workflow (record now, conclude later) is a team-pass
// candidate, not built here.
export function AddTestForm({
  parentType,
  parentId,
  defaultType,
}: {
  parentType: 'milestone' | 'task';
  parentId: string;
  defaultType: 'developer' | 'uat';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'developer' | 'uat'>(defaultType);
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState<'pass' | 'fail'>('pass');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Enter a test title.');
      return;
    }
    startTransition(async () => {
      try {
        await createTest(parentType, parentId, {
          test_type: type,
          title: title.trim(),
          outcome,
        });
        setTitle('');
        setType(defaultType);
        setOutcome('pass');
        setOpen(false);
        router.refresh();
      } catch {
        setError('Could not record the test.');
      }
    });
  }

  const fieldCls =
    'rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast placeholder:text-ink-tertiary focus:border-border-focus focus:shadow-focus';

  if (!open) {
    return (
      <button
        type="button"
        data-testid="test-add"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md border border-border-subtle bg-surface px-3 py-1 text-sm text-ink-secondary transition-colors duration-fast hover:bg-hover"
      >
        + Record test
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      data-testid="test-form"
      className="flex w-full flex-col gap-2"
    >
      <div className="flex gap-2">
        <select
          data-testid="test-type"
          value={type}
          onChange={(e) => setType(e.target.value as 'developer' | 'uat')}
          className={`${fieldCls} flex-1`}
        >
          <option value="developer">Developer</option>
          <option value="uat">UAT</option>
        </select>
        <select
          data-testid="test-outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as 'pass' | 'fail')}
          className={`${fieldCls} w-28`}
        >
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
      </div>
      <input
        data-testid="test-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Test title"
        className={fieldCls}
      />
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
          data-testid="test-save"
          disabled={pending || !title.trim()}
          className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
