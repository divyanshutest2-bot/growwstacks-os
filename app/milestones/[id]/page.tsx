import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  TrendingUp,
  Info,
  TriangleAlert,
  FileText,
  Image as ImageIcon,
  Link2,
  ExternalLink,
  Download,
  Pencil,
  Plus,
  Clock,
  MessagesSquare,
} from 'lucide-react';

import '@/app/contact-detail.css';
import '@/app/milestone-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { HeaderName } from '@/components/milestones/HeaderName';
import { StatusPillEditor } from '@/components/milestones/StatusPillEditor';
import {
  DetailInlineText,
  DetailInlineNumber,
  DetailInlineDate,
} from '@/components/milestones/DetailInlineField';
import { DetailMembersEditor } from '@/components/milestones/DetailMembersEditor';
import { TasksList } from '@/components/milestones/TasksList';
import { TestsList } from '@/components/milestones/TestsList';
import { CompletionCard } from '@/components/milestones/CompletionCard';
import { BillingCard } from '@/components/milestones/BillingCard';
import { NotesAdd } from '@/components/milestones/NotesAdd';
import { AttachmentsAdd } from '@/components/milestones/AttachmentsAdd';
import { ArchiveMenu } from '@/components/milestones/ArchiveMenu';

import {
  getMilestone,
  listMilestoneTasks,
  listMilestoneTests,
} from '@/lib/actions/milestones';
import {
  listConversation,
  listNotes,
  listAttachments,
  listAiInsights,
} from '@/lib/actions/polymorphic';
import { listActiveUsers } from '@/lib/actions/directory';
import { getCurrentUserRole } from '@/lib/auth';

import {
  avatarBg,
  initials,
  formatDate,
  formatINRLakhs,
} from '@/lib/ui';
import {
  MILESTONE_STATUS_DOT,
  scheduleStateClass,
  formatMoney,
} from '@/lib/ui-milestones';

import type { MilestoneDetail } from '@/lib/types-milestones';
import type {
  ConversationRow,
  NoteRow,
  AttachmentRow,
  AiInsightRow,
} from '@/lib/types';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Sentiment → icon + color var for the AI Supervisor card.
const SENTIMENT_ICON = {
  positive: { Icon: TrendingUp, color: 'var(--color-ai-positive)' },
  neutral: { Icon: Info, color: 'var(--color-ai-neutral)' },
  risk: { Icon: TriangleAlert, color: 'var(--color-ai-risk)' },
} as const;

// /milestones/[id] — the three-column milestone cockpit (Milestone Detail.html).
// Server Component; every read is RLS-gated via the actions. getMilestone
// role-branches:
//   developer  → PARTIAL projection (v_milestone_dev): NO billing, NO contact/
//                company/price/currency. Delivery only.
//   full       → v_milestone_rollup + v_milestone_billing + progress + spine names.
//
// 🚨 The page renders DIFFERENTLY by data shape (result.is_dev). Completion is
// READ-ONLY (task-count derived from v_milestone_progress) — never an editable
// field. getMilestone returns null when RLS denies the row → notFound().
export default async function MilestoneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = (await getMilestone(id)) as MilestoneDetail | null;
  if (!result) notFound();

  const role = await getCurrentUserRole();
  const canManage = role === 'admin' || role === 'pm';
  const isDev = result.is_dev;

  const milestone = result.milestone;
  const mId = milestone.id;

  // Fan out the cockpit reads (all RLS-gated). Member options only for managers.
  const [users, tasks, tests, conversation, notes, attachments, insights] =
    await Promise.all([
      canManage ? listActiveUsers() : Promise.resolve([]),
      listMilestoneTasks(mId),
      listMilestoneTests(mId),
      listConversation('milestone', mId) as Promise<ConversationRow[]>,
      listNotes('milestone', mId) as Promise<NoteRow[]>,
      listAttachments('milestone', mId) as Promise<AttachmentRow[]>,
      listAiInsights('milestone', mId) as Promise<AiInsightRow[]>,
    ]);

  const progress = result.progress;
  const totalTasks = progress?.total_tasks ?? null;
  const doneTasks = progress?.done_tasks ?? null;

  const scheduleState = milestone.schedule_state ?? null;
  const statusDot = MILESTONE_STATUS_DOT[milestone.status] ?? 'var(--color-text-muted)';

  // Money is full-projection only. The dev shape physically lacks price/currency.
  const price = !isDev ? result.milestone.price ?? null : null;
  const currency = !isDev ? result.milestone.currency ?? null : null;
  const received = !isDev ? result.billing?.received ?? null : null;
  const estHours = milestone.estimated_hours ?? null;
  const timeSpentHours =
    !isDev && result.milestone.time_spent_minutes != null
      ? Math.round((Number(result.milestone.time_spent_minutes) / 60) * 10) / 10
      : null;

  const fileCount = attachments.length;

  return (
    <AppShell title="Milestone">
      <div data-testid="milestone-detail">
        {/* HEADER */}
        <div className="detail-head">
          <span className="msq lg">{milestone.display_id}</span>
          <div className="dh-main">
            <div className="dh-title-row">
              <div data-testid="milestone-field-name" className="dh-name">
                {canManage ? (
                  <HeaderName milestoneId={mId} value={milestone.name} />
                ) : (
                  <h1>{milestone.name}</h1>
                )}
              </div>
              <StatusPillEditor
                milestoneId={mId}
                status={milestone.status}
                editable={canManage}
              />
              {scheduleState && (
                <span className={`schedule ${scheduleStateClass(scheduleState)}`}>
                  <Clock size={13} />
                  {scheduleState}
                </span>
              )}
            </div>
            <div className="dh-sub">
              <span className="mono" style={{ fontFamily: 'var(--font-mono)' }}>
                {milestone.display_id}
              </span>
              {result.project && (
                <>
                  {' · '}
                  <Link href={`/projects/${result.project.id}`}>
                    {result.project.name}
                  </Link>
                </>
              )}
              {/* Client identity ONLY in the full projection. */}
              {!isDev && result.contact && (
                <>
                  {' · '}
                  <Link href={`/contacts/${result.contact.id}`}>
                    {result.contact.full_name}
                  </Link>
                </>
              )}
              {milestone.target_date && (
                <> · target {formatDate(milestone.target_date)}</>
              )}
            </div>
          </div>
          <div className="spacer" />
          {canManage && <ArchiveMenu milestoneId={mId} />}
          {canManage && (
            <Link href="/milestones" className="btn btn-secondary">
              <Pencil size={16} />
              Edit
            </Link>
          )}
          {canManage && (
            <Link href="/milestones" className="btn btn-primary">
              <Plus size={16} />
              Add task
            </Link>
          )}
        </div>

        {/* HERO STATSTRIP — Completion (read-only) · Tasks · Hours · Value · Received */}
        <div className="statstrip" style={{ marginBottom: 18 }}>
          <div className="stat">
            <div className="k">Completion</div>
            <div className="v" style={{ color: 'var(--color-accent-text)' }}>
              {pctText(milestone.completion_pct)}
            </div>
            <div className="s">by task count</div>
          </div>
          <div className="stat">
            <div className="k">Tasks</div>
            <div className="v">
              {doneTasks ?? 0} / {totalTasks ?? 0}
            </div>
            <div className="s">done</div>
          </div>
          <div className="stat">
            <div className="k">Hours</div>
            <div className="v">
              {timeSpentHours ?? 0} / {estHours ?? 0}
            </div>
            <div className="s">spent / est</div>
          </div>
          {!isDev && (
            <div className="stat">
              <div className="k">Value</div>
              <div className="v">{formatINRLakhs(price)}</div>
            </div>
          )}
          {!isDev && (
            <div className="stat">
              <div className="k">Received</div>
              <div className="v" style={{ color: 'var(--color-warning-text)' }}>
                {formatINRLakhs(received)}
              </div>
              <div className="s">on delivery</div>
            </div>
          )}
        </div>

        <div className="dgrid">
          {/* LEFT RAIL — milestone meta + members + attachments */}
          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h3>Milestone details</h3>
              </div>
              <div className="card-b" style={{ paddingTop: 8 }}>
                <div className="meta-row">
                  <span className="k">Milestone ID</span>
                  <span
                    className="mono"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {milestone.display_id}
                  </span>
                </div>

                <div className="meta-row">
                  <span className="k">Project</span>
                  <div className="ie" data-ie="static">
                    {result.project ? (
                      <Link
                        href={`/projects/${result.project.id}`}
                        style={{ fontSize: 14 }}
                      >
                        {result.project.name}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>
                        —
                      </span>
                    )}
                  </div>
                </div>

                {/* Completion is READ-ONLY (task-count derived) — never an editable
                    field. Rendered as a static meta-row with a lock tag. */}
                <div className="meta-row">
                  <span className="k">Completion</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 14,
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {pctText(milestone.completion_pct)}
                    <span className="readonly-tag">from tasks</span>
                  </div>
                </div>

                {isDev ? (
                  <>
                    <DevMetaRow
                      label="Start date"
                      value={formatDate(milestone.start_date)}
                      mono
                    />
                    <DevMetaRow
                      label="Target date"
                      value={formatDate(milestone.target_date)}
                      mono
                    />
                    <DevMetaRow
                      label="Actual completion"
                      value={formatDate(milestone.actual_completion_date)}
                      mono
                    />
                    <DevMetaRow
                      label="Estimated hours"
                      value={estHours != null ? String(estHours) : '—'}
                      mono
                    />
                  </>
                ) : (
                  <>
                    <DetailInlineDate
                      milestoneId={mId}
                      field="start_date"
                      label="Start date"
                      value={milestone.start_date}
                    />
                    <DetailInlineDate
                      milestoneId={mId}
                      field="target_date"
                      label="Target date"
                      value={milestone.target_date}
                    />
                    <DetailInlineDate
                      milestoneId={mId}
                      field="actual_completion_date"
                      label="Actual completion"
                      value={milestone.actual_completion_date}
                    />
                    <DetailInlineNumber
                      milestoneId={mId}
                      field="estimated_hours"
                      label="Estimated hours"
                      value={milestone.estimated_hours}
                      placeholder="0.0"
                    />
                    <DetailInlineNumber
                      milestoneId={mId}
                      field="price"
                      label="Value (price)"
                      value={result.milestone.price}
                      placeholder="0.00"
                    />
                    <DetailInlineText
                      milestoneId={mId}
                      field="currency"
                      label="Currency"
                      value={result.milestone.currency}
                      placeholder="USD"
                      mono
                    />
                  </>
                )}

                {/* Team — full projection gets the editor; developers see their own
                    chip(s) read-only (RLS returns only their membership row). */}
                {canManage ? (
                  <DetailMembersEditor
                    milestoneId={mId}
                    members={result.members}
                    userOptions={users}
                  />
                ) : (
                  <div className="meta-row">
                    <span className="k">Team</span>
                    <div className="ostack" style={{ marginTop: 4 }}>
                      {result.members.length === 0 ? (
                        <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                          —
                        </span>
                      ) : (
                        result.members.map((m) => (
                          <span
                            key={m.user_id}
                            className="wrap"
                            title={m.full_name ?? m.email ?? m.user_id}
                          >
                            <span
                              className="avatar"
                              style={{ background: avatarBg(m.user_id) }}
                            >
                              {initials(m.full_name ?? m.email)}
                            </span>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Attachments */}
            <div className="card" data-testid="card-attachments">
              <div className="card-h">
                <h3>Attachments</h3>
                {fileCount > 0 && (
                  <span className="cnt">
                    {fileCount} {fileCount === 1 ? 'file' : 'files'}
                  </span>
                )}
              </div>
              <div className="card-b" style={{ padding: 6 }}>
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sum"
                    style={{
                      padding: 8,
                      borderRadius: 'var(--radius-sm)',
                      textDecoration: 'none',
                    }}
                  >
                    {a.kind === 'link' ? (
                      <Link2 size={18} style={{ color: 'var(--color-accent)' }} />
                    ) : a.mime_type?.startsWith('image') ? (
                      <ImageIcon size={18} style={{ color: 'var(--color-accent)' }} />
                    ) : (
                      <FileText size={18} style={{ color: 'var(--color-info-fg)' }} />
                    )}
                    <div className="t">
                      <div className="l1">{a.title}</div>
                      <div
                        className="l2 mono"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {a.kind === 'link' ? a.url : a.mime_type ?? 'file'}
                      </div>
                    </div>
                    {a.kind === 'link' ? (
                      <ExternalLink size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    ) : (
                      <Download size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    )}
                  </a>
                ))}
                <AttachmentsAdd milestoneId={mId} />
              </div>
            </div>
          </div>

          {/* CENTER — Tasks (center-of-gravity) + Tests */}
          <div className="stack">
            <TasksList tasks={tasks} />
            <TestsList
              tests={tests}
              parentId={mId}
              canRecord={canManage}
              canArchive={canManage}
              defaultType="uat"
            />
          </div>

          {/* RIGHT RAIL — AI · Completion · Billing · Notes · Conversation */}
          <div className="stack">
            {/* AI Supervisor */}
            <div className="card ai-card" data-testid="card-ai-insights">
              <div className="card-h" style={{ borderBottom: 0, paddingBottom: 4 }}>
                <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
                <h3>AI Supervisor</h3>
              </div>
              <div
                className="card-b"
                style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {insights.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
                    No insights yet
                  </p>
                ) : (
                  insights.map((i) => {
                    const meta = i.sentiment
                      ? SENTIMENT_ICON[i.sentiment as keyof typeof SENTIMENT_ICON]
                      : null;
                    const Icon = meta?.Icon ?? Info;
                    const color = meta?.color ?? 'var(--color-ai-neutral)';
                    return (
                      <div className="insight" key={i.id}>
                        <Icon size={16} style={{ color }} />
                        <p>{i.body}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Completion (read-only, task-count derived) */}
            <CompletionCard
              completionPct={milestone.completion_pct}
              doneTasks={doneTasks}
              totalTasks={totalTasks}
              estimatedHours={estHours}
              timeSpentHours={timeSpentHours}
            />

            {/* Billing — FULL projection ONLY. Developer path never renders this. */}
            {!isDev && <BillingCard billing={result.billing} />}

            {/* Notes */}
            <div className="card" data-testid="card-notes">
              <div className="card-h">
                <h3>Notes</h3>
                <span className="cnt">{notes.length}</span>
                <span className="more">
                  <NotesAdd milestoneId={mId} />
                </span>
              </div>
              <div className="card-b">
                {notes.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                    No notes yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          borderLeft: '2px solid var(--color-accent-border)',
                          paddingLeft: 12,
                        }}
                      >
                        {n.title && (
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>
                            {n.title}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 12.5,
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {n.body}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--color-text-muted)',
                            marginTop: 6,
                          }}
                        >
                          {n.author_name ?? 'Unknown'} · {formatDate(n.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Conversation (read-only thread; ingestion is via n8n sync) */}
            <div className="card" data-testid="card-conversation">
              <div className="card-h">
                <MessagesSquare size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                <h3>Conversation</h3>
                <span className="cnt">
                  {conversation.length}{' '}
                  {conversation.length === 1 ? 'message' : 'messages'}
                </span>
              </div>
              <div className="card-b">
                {conversation.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                    No messages on this milestone.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {conversation.map((c) => (
                      <div key={c.id}>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {c.body}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--color-text-muted)',
                            marginTop: 4,
                          }}
                        >
                          {c.sender_user_name ??
                            c.sender_contact_name ??
                            c.channel}{' '}
                          · {formatDate(c.occurred_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// A read-only meta-row (developer projection — no inline editors). Note: we do NOT
// emit milestone-field-{field} testids here for date/hours (those are full-only),
// matching the dev partial shape.
function DevMetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="meta-row">
      <span className="k">{label}</span>
      <span
        style={{
          fontSize: mono ? 13 : 14,
          color: 'var(--color-text-secondary)',
          ...(mono ? { fontFamily: 'var(--font-mono)' } : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

function pctText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0%';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0%';
  return `${Math.round(n)}%`;
}
