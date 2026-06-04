'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { createNote } from '@/lib/actions/polymorphic';

// CompanyNotesAdd — the design's "+ Add" note affordance for the cockpit Notes
// card, wired to the universal createNote action with parent_type='company'.
// Mirrors the approved contacts NotesAdd.
export function CompanyNotesAdd({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    startTransition(async () => {
      try {
        await createNote('company', companyId, { title: title || null, body });
        setTitle('');
        setBody('');
        setOpen(false);
        router.refresh();
      } catch {
        /* leave the form open; user can retry */
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm more"
        style={{ padding: '4px 8px' }}
        onClick={() => setOpen(true)}
      >
        <Plus size={14} />
        Add
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        style={{
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 10px',
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 0,
          color: 'var(--color-text-primary)',
        }}
      />
      <textarea
        rows={3}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a note…"
        style={{
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 10px',
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 0,
          resize: 'vertical',
          color: 'var(--color-text-primary)',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !body.trim()}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
