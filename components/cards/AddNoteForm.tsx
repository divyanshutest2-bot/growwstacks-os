'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createNote } from '@/lib/actions/polymorphic';

// AddNoteForm — generic over (parentType, parentId). Adds a markdown note.
export function AddNoteForm({
  parentType,
  parentId,
}: {
  parentType: string;
  parentId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createNote(parentType, parentId, {
          title: title || null,
          body,
        });
        setTitle('');
        setBody('');
        setOpen(false);
        router.refresh();
      } catch {
        setError('Could not add the note.');
      }
    });
  }

  const fieldCls =
    'w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast placeholder:text-ink-tertiary focus:border-border-focus focus:shadow-focus';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md border border-border-subtle bg-surface px-3 py-1 text-sm text-ink-secondary transition-colors duration-fast hover:bg-hover"
      >
        + Add note
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className={fieldCls}
      />
      <textarea
        rows={3}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a note (markdown)…"
        className={`${fieldCls} resize-y font-mono`}
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
          disabled={pending || !body.trim()}
          className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </form>
  );
}
