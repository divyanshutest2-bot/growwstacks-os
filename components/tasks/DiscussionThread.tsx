'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { MessagesSquare, Paperclip, Send, CheckCheck } from 'lucide-react';

import { sendTaskMessage } from '@/lib/actions/tasks';
import { avatarBg, initials } from '@/lib/ui';
import type { ConversationRow } from '@/lib/types';

// DiscussionThread — the Task Detail center card's INTERNAL discussion (parent_
// type='task'). This is a TEAM thread, not a client channel: no client identity,
// no channel chips. Reuses the universal listConversation('task', id) read; posts
// via sendTaskMessage (recorded over the internal 'slack' channel). Carries the
// card-conversation testid the smoke spec asserts.

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DiscussionThread({
  taskId,
  entries,
}: {
  taskId: string;
  entries: ConversationRow[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    const body = draft.trim();
    if (!body || pending) return;
    setDraft('');
    startTransition(async () => {
      try {
        await sendTaskMessage(taskId, body);
        router.refresh();
      } catch {
        setDraft(body); // restore on failure — don't fake delivery
      }
    });
  }

  const rows: React.ReactNode[] = [];
  let lastDay = '';
  for (const e of entries) {
    const d = dayLabel(e.occurred_at);
    if (d && d !== lastDay) {
      rows.push(
        <div className="day" key={`day-${e.id}`}>
          {d}
        </div>,
      );
      lastDay = d;
    }

    const sender = e.sender_user_name ?? 'Teammate';

    if (e.direction === 'inbound') {
      rows.push(
        <div className="msg-in" key={e.id}>
          <span className="av-sm" style={{ background: avatarBg(e.sender_user_id ?? e.id) }}>
            {initials(sender)}
          </span>
          <div>
            <div className="bubble-in">{e.body}</div>
            <div className="msg-meta">
              {sender} · {timeLabel(e.occurred_at)}
            </div>
          </div>
        </div>,
      );
    } else {
      rows.push(
        <div className="msg-out" key={e.id}>
          <div>
            <div className="bubble-out">{e.body}</div>
            <div className="msg-meta" style={{ justifyContent: 'flex-end' }}>
              {sender} · {timeLabel(e.occurred_at)} ·{' '}
              <CheckCheck size={11} style={{ color: 'var(--color-info-fg)' }} />
            </div>
          </div>
        </div>,
      );
    }
  }

  return (
    <div className="card conv-card" data-testid="card-conversation">
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessagesSquare size={16} style={{ color: 'var(--color-text-tertiary)' }} />
          <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700 }}>
            Discussion
          </h3>
          <span className="cnt">internal</span>
        </div>
      </div>

      <div className="thread">
        {entries.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
            }}
          >
            No discussion yet
          </div>
        ) : (
          rows
        )}
      </div>

      <div className="composer">
        <input
          className="inp"
          value={draft}
          placeholder="Add to the discussion…"
          aria-label="Add to the discussion"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} title="Attach">
          <Paperclip size={16} />
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ padding: '8px 10px' }}
          disabled={pending || !draft.trim()}
          onClick={submit}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
