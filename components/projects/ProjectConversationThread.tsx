'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  MessagesSquare,
  Paperclip,
  Send,
  Phone,
  Play,
  Sparkles,
  CheckCheck,
} from 'lucide-react';

import { sendProjectMessage } from '@/lib/actions/projects';
import { avatarBg, initials } from '@/lib/ui';
import type { ConversationRow } from '@/lib/types';

// ProjectConversationThread — the project-level conversation card for the cockpit.
// Identical structure to the approved contacts/companies ConversationThread, but
// sends via sendProjectMessage (parent_type='project'). Records intent locally; it
// does NOT deliver to the external channel (n8n sync, Phase 2). Carries
// data-testid="card-conversation". Used only on the FULL projection (the developer
// delivery cockpit has no client conversation surface).

const CH_VAR: Record<string, string> = {
  whatsapp: 'var(--ch-whatsapp)',
  gmail: 'var(--ch-gmail)',
  slack: 'var(--ch-slack)',
  phone: 'var(--ch-phone)',
  upwork: 'var(--ch-upwork)',
  teams: 'var(--ch-teams)',
  outlook: 'var(--ch-outlook)',
  zoom: 'var(--ch-zoom)',
  fireflies: 'var(--ch-fireflies)',
  google_meet: 'var(--ch-zoom)',
};

const CH_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  gmail: 'Gmail',
  slack: 'Slack',
  phone: 'Phone',
  upwork: 'Upwork',
  teams: 'Teams',
  outlook: 'Outlook',
  zoom: 'Zoom',
  fireflies: 'Fireflies',
  google_meet: 'Google Meet',
};

const MEETING_CHANNELS = new Set(['zoom', 'fireflies', 'teams', 'google_meet', 'phone']);

const FILTER_CHIPS: { ch: string; label: string }[] = [
  { ch: 'all', label: 'All' },
  { ch: 'whatsapp', label: 'WhatsApp' },
  { ch: 'gmail', label: 'Gmail' },
  { ch: 'slack', label: 'Slack' },
  { ch: 'phone', label: 'Calls' },
  { ch: 'upwork', label: 'Upwork' },
];

function chVar(ch: string): string {
  return CH_VAR[ch] ?? 'var(--color-text-muted)';
}

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

export function ProjectConversationThread({
  projectId,
  projectName,
  entries,
}: {
  projectId: string;
  projectName: string;
  entries: ConversationRow[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();

  const channelCount = useMemo(
    () => new Set(entries.map((e) => e.channel)).size,
    [entries],
  );

  const visible = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.channel === filter)),
    [entries, filter],
  );

  const defaultChannel =
    [...entries].reverse().find((e) => e.direction === 'inbound')?.channel ?? 'whatsapp';

  function submit() {
    const body = draft.trim();
    if (!body || pending) return;
    setDraft('');
    startTransition(async () => {
      try {
        await sendProjectMessage(projectId, { channel: defaultChannel, body });
        router.refresh();
      } catch {
        setDraft(body); // restore on failure — don't fake delivery
      }
    });
  }

  const rows: React.ReactNode[] = [];
  let lastDay = '';
  for (const e of visible) {
    const d = dayLabel(e.occurred_at);
    if (d && d !== lastDay) {
      rows.push(
        <div className="day" key={`day-${e.id}`}>
          {d}
        </div>,
      );
      lastDay = d;
    }

    const sender = e.sender_contact_name ?? e.sender_user_name ?? projectName;

    if (MEETING_CHANNELS.has(e.channel) && (e.meeting_recording_url || e.meeting_summary || e.duration_minutes)) {
      rows.push(
        <div className="callcard" key={e.id}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-info-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Phone size={16} style={{ color: 'var(--color-info-solid)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {CH_LABEL[e.channel] ?? e.channel} call
              {e.duration_minutes ? ` · ${e.duration_minutes} min` : ''}
            </div>
            {e.meeting_summary && (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                {e.meeting_summary}
              </div>
            )}
          </div>
          {e.meeting_recording_url && (
            <a
              className="badge"
              href={e.meeting_recording_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', fontSize: 9 }}
            >
              <Play size={11} />
              Recording
            </a>
          )}
          {e.meeting_summary && (
            <span
              className="badge"
              style={{ background: 'var(--color-ai-tint)', color: 'var(--color-accent-text)', fontSize: 9 }}
            >
              <Sparkles size={11} />
              AI summary
            </span>
          )}
        </div>,
      );
      continue;
    }

    if (e.direction === 'inbound') {
      rows.push(
        <div className="msg-in" key={e.id}>
          <span className="av-sm" style={{ background: chVar(e.channel) }}>
            {initials(sender)}
          </span>
          <div>
            <div className="bubble-in">{e.body}</div>
            <div className="msg-meta">
              <span className="dot" style={{ background: chVar(e.channel) }} />
              {CH_LABEL[e.channel] ?? e.channel} · {sender} · {timeLabel(e.occurred_at)}
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
              <span className="dot" style={{ background: chVar(e.channel) }} />
              You · {timeLabel(e.occurred_at)} ·{' '}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <MessagesSquare size={16} style={{ color: 'var(--color-text-tertiary)' }} />
          <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700 }}>
            Conversation
          </h3>
          <span className="cnt">
            {entries.length} {entries.length === 1 ? 'message' : 'messages'} ·{' '}
            {channelCount} {channelCount === 1 ? 'channel' : 'channels'}
          </span>
        </div>
        <div className="chips">
          {FILTER_CHIPS.map((c) => (
            <span
              key={c.ch}
              className={`chip${filter === c.ch ? ' active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setFilter(c.ch)}
            >
              {c.ch !== 'all' && <span className="dot" style={{ background: chVar(c.ch) }} />}
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="thread">
        {visible.length === 0 ? (
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
            No messages yet
          </div>
        ) : (
          rows
        )}
      </div>

      <div className="composer">
        <button
          type="button"
          className="icon-btn"
          title="Channel"
          style={{ width: 30, height: 30 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: chVar(defaultChannel),
              display: 'inline-block',
            }}
          />
        </button>
        <input
          className="inp"
          value={draft}
          placeholder={`Reply via ${CH_LABEL[defaultChannel] ?? defaultChannel}…`}
          aria-label="Reply"
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
