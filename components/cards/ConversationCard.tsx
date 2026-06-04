import { Card } from '@/components/cards/Card';
import { listConversation } from '@/lib/actions/polymorphic';
import { CHANNEL_TEXT, formatDateTime } from '@/lib/ui';
import type { ConversationRow } from '@/lib/types';

// ConversationCard — universal, generic over (parentType, parentId). Lists
// conversation_entries ASC by occurred_at, channel-colored. Read-only (entries
// are ingested via n8n sync, not authored in this UI). Server Component.
export async function ConversationCard({
  parentType,
  parentId,
}: {
  parentType: string;
  parentId: string;
}) {
  const entries = (await listConversation(
    parentType,
    parentId,
  )) as ConversationRow[];

  return (
    <Card title="Conversation" testId="card-conversation">
      {entries.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No conversation yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((e) => {
            const channelCls = CHANNEL_TEXT[e.channel] ?? 'text-ink-secondary';
            const sender =
              e.sender_user_name ?? e.sender_contact_name ?? 'Unknown';
            return (
              <li
                key={e.id}
                className="rounded-md border border-border-subtle bg-subtle p-4"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold uppercase tracking-wide ${channelCls}`}
                  >
                    {e.channel} · {e.direction}
                  </span>
                  <span className="text-xs text-ink-tertiary">
                    {formatDateTime(e.occurred_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-ink">{sender}</p>
                {e.body && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-secondary">
                    {e.body}
                  </p>
                )}
                {e.meeting_summary && (
                  <p className="mt-2 rounded-md bg-surface p-3 text-sm text-ink-secondary">
                    {e.meeting_summary}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
