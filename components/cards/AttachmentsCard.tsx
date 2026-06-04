import { Card } from '@/components/cards/Card';
import { AddAttachmentLinkForm } from '@/components/cards/AddAttachmentLinkForm';
import { listAttachments } from '@/lib/actions/polymorphic';
import { formatDate } from '@/lib/ui';
import type { AttachmentRow } from '@/lib/types';

// AttachmentsCard — universal, generic over (parentType, parentId). Lists
// file/link attachments + "add link". Server Component.
export async function AttachmentsCard({
  parentType,
  parentId,
}: {
  parentType: string;
  parentId: string;
}) {
  const attachments = (await listAttachments(
    parentType,
    parentId,
  )) as AttachmentRow[];

  return (
    <Card
      title="Attachments"
      testId="card-attachments"
      action={
        <AddAttachmentLinkForm parentType={parentType} parentId={parentId} />
      }
    >
      {attachments.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No attachments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md border border-border-subtle bg-subtle p-3"
            >
              <div className="min-w-0">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm font-medium text-ink-link hover:underline"
                >
                  {a.title}
                </a>
                <p className="text-xs text-ink-tertiary">
                  {a.kind}
                  {a.purpose ? ` · ${a.purpose}` : ''} ·{' '}
                  {formatDate(a.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
