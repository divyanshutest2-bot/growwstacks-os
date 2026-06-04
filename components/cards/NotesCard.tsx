import { Card } from '@/components/cards/Card';
import { AddNoteForm } from '@/components/cards/AddNoteForm';
import { listNotes } from '@/lib/actions/polymorphic';
import { formatDateTime } from '@/lib/ui';
import type { NoteRow } from '@/lib/types';

// NotesCard — universal, generic over (parentType, parentId). Lists notes +
// add. Reused unchanged by every entity. Server Component (fetches via action).
export async function NotesCard({
  parentType,
  parentId,
}: {
  parentType: string;
  parentId: string;
}) {
  const notes = (await listNotes(parentType, parentId)) as NoteRow[];

  return (
    <Card
      title="Notes"
      testId="card-notes"
      action={<AddNoteForm parentType={parentType} parentId={parentId} />}
    >
      {notes.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-md border border-border-subtle bg-subtle p-4"
            >
              {n.title && (
                <p className="font-medium text-ink">{n.title}</p>
              )}
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-secondary">
                {n.body}
              </p>
              <p className="mt-2 text-xs text-ink-tertiary">
                {n.author_name ?? 'Unknown'} · {formatDateTime(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
