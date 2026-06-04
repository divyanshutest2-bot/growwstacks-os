'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { addAttachmentLink } from '@/lib/actions/polymorphic';

// AddAttachmentLinkForm — generic over (parentType, parentId). Adds a kind='link'
// attachment. File upload (Drive proxy) is a later phase; links need no proxy.
export function AddAttachmentLinkForm({
  parentType,
  parentId,
}: {
  parentType: string;
  parentId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await addAttachmentLink(parentType, parentId, { title, url });
        setTitle('');
        setUrl('');
        setOpen(false);
        router.refresh();
      } catch {
        setError('Could not add the link. Check the URL.');
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
        + Add link
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2">
      <input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className={fieldCls}
      />
      <input
        required
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
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
          disabled={pending || !title.trim() || !url.trim()}
          className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Add link'}
        </button>
      </div>
    </form>
  );
}
