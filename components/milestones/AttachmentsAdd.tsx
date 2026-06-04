'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Upload } from 'lucide-react';

import { addAttachmentLink } from '@/lib/actions/polymorphic';

// AttachmentsAdd — the design's dashed "Drop file · + link" control at the bottom
// of the milestone cockpit Attachments card. "+ link" opens an inline title+url
// form wired to the universal addAttachmentLink action (parent_type='milestone').
// File uploads go through the n8n Drive proxy later; links need no proxy. Mirrors
// the Contacts AttachmentsAdd.
export function AttachmentsAdd({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileHint, setFileHint] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openForm(showFileHint: boolean) {
    setFileHint(showFileHint);
    setError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await addAttachmentLink('milestone', milestoneId, {
          title: title.trim(),
          url: url.trim(),
        });
        setTitle('');
        setUrl('');
        setOpen(false);
        setFileHint(false);
        router.refresh();
      } catch {
        setError('Could not add link — check the URL and try again.');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="attach-drop"
        onClick={() => openForm(true)}
        data-testid="attachment-add"
      >
        <Upload size={14} />
        Drop file ·{' '}
        <span
          className="attach-link"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            openForm(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              openForm(false);
            }
          }}
        >
          + link
        </span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="attach-form" data-testid="attachment-form">
      {fileHint && (
        <div className="attach-hint">File upload coming soon — paste a link for now.</div>
      )}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        aria-label="Attachment title"
        className="attach-input"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        aria-label="Attachment URL"
        type="url"
        className="attach-input"
      />
      {error && <div className="attach-error">{error}</div>}
      <div className="attach-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setOpen(false);
            setFileHint(false);
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={pending || !title.trim() || !url.trim()}
        >
          {pending ? 'Saving…' : 'Add link'}
        </button>
      </div>
    </form>
  );
}
