import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  Info,
  TrendingUp,
  TriangleAlert,
  FileText,
  Download,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  Clock,
  FlaskConical,
  CircleCheck,
  CircleX,
  CircleDashed,
} from 'lucide-react';

import '@/app/contact-detail.css';
import '@/app/task-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { DetailHeaderTitle } from '@/components/tasks/DetailHeaderTitle';
import { StatusFieldEditor } from '@/components/tasks/StatusFieldEditor';
import { DetailInlineText, DetailInlineSelect } from '@/components/tasks/DetailInlineField';
import { DetailAssigneesEditor } from '@/components/tasks/DetailAssigneesEditor';
import { DetailManagersEditor } from '@/components/tasks/DetailManagersEditor';
import { DiscussionThread } from '@/components/tasks/DiscussionThread';
import { TaskNotesAdd } from '@/components/tasks/TaskNotesAdd';
import { TaskAttachmentsAdd } from '@/components/tasks/TaskAttachmentsAdd';
import { AddTimeLogForm } from '@/components/cards/AddTimeLogForm';
import { ArchiveTimeLogButton } from '@/components/cards/ArchiveTimeLogButton';
import { AddTestForm } from '@/components/cards/AddTestForm';
import { ArchiveTestButton } from '@/components/cards/ArchiveTestButton';

import { getTask, listTaskTests, listTaskTimeLogs } from '@/lib/actions/tasks';
import {
  listConversation,
  listNotes,
  listAttachments,
  listAiInsights,
} from '@/lib/actions/polymorphic';
import { listActiveUsers } from '@/lib/actions/directory';
import { getCurrentUserId, getCurrentUserRole } from '@/lib/auth';

import { avatarBg, initials, formatDate } from '@/lib/ui';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TEXT_VAR,
  TASK_DELIVERY_STATES,
  TASK_DELIVERY_STATE_LABEL,
  scheduleStateClass,
  formatHours,
} from '@/lib/ui-tasks';

import type {
  TaskDetail,
  TaskTestRow,
  TaskTimeLogRow,
} from '@/lib/types-tasks';
import type {
  ConversationRow,
  NoteRow,
  AttachmentRow,
  AiInsightRow,
} from '@/lib/types';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Sentiment → icon + color var for the AI Review card.
const SENTIMENT_ICON = {
  positive: { Icon: TrendingUp, color: 'var(--color-ai-positive)' },
  neutral: { Icon: Info, color: 'var(--color-ai-neutral)' },
  risk: { Icon: TriangleAlert, color: 'var(--color-ai-risk)' },
} as const;

// schedule-pill class string → inline token vars (the shell's .schedule helper).
const SCHEDULE_VARS: Record<string, { bg: string; text: string; border: string }> = {
  'bg-danger-bg text-danger-text border-danger-border': {
    bg: 'var(--color-danger-bg)',
    text: 'var(--color-danger-text)',
    border: 'var(--color-danger-border)',
  },
  'bg-warning-bg text-warning-text border-warning-border': {
    bg: 'var(--color-warning-bg)',
    text: 'var(--color-warning-text)',
    border: 'var(--color-warning-border)',
  },
  'bg-success-bg text-success-text border-success-border': {
    bg: 'var(--color-success-bg)',
    text: 'var(--color-success-text)',
    border: 'var(--color-success-border)',
  },
  'bg-info-bg text-info-text border-info-border': {
    bg: 'var(--color-info-bg)',
    text: 'var(--color-info-text)',
    border: 'var(--color-info-border)',
  },
  'bg-subtle text-ink-secondary border-border-subtle': {
    bg: 'var(--color-bg-subtle)',
    text: 'var(--color-text-secondary)',
    border: 'var(--color-border-subtle)',
  },
};

// /tasks/[id] — the three-column task cockpit (dev-safe). Server Component; every
// read is RLS-gated via the server actions.
//
// 🚨 getTask role-branches: developers get the PARTIAL projection (v_task_dev —
// NO client identity: contact/company stripped), everyone else gets the FULL
// projection (v_task_rollup + the parent contact name + milestone). The page
// renders the SAME cockpit either way; the ONLY difference is that the client
// (contact) link appears solely in the full projection (result.is_dev === false).
//
// Tasks have NO billing card (no money columns) — neither shape renders one.
// getTask returns null when RLS denies the row (a non-assignee developer) →
// notFound(), indistinguishable from not-found by design.
export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = (await getTask(id)) as TaskDetail | null;
  if (!result) notFound();

  const task = result.task;

  // Only admin/pm can mutate the join tables (RLS); harmless to pass for
  // developers (the picker renders "No more users" when empty).
  const role = await getCurrentUserRole();
  const canManage = role === 'admin' || role === 'pm';
  // Time-log entry: only roles that can INSERT own AND read their own row back
  // (INSERT … RETURNING enforces the SELECT policy). PM/finance/sales get no form.
  const canLogTime = role === 'admin' || role === 'developer';
  // Test recording on a TASK: fn_can_edit('task') = admin/pm OR a developer
  // ASSIGNED to this task. A member-but-unassigned developer cannot record.
  const uid = await getCurrentUserId();
  const isTaskAssignee = result.assignees.some((a) => a.user_id === uid);
  const canRecordTaskTest =
    role === 'admin' || role === 'pm' || (role === 'developer' && isTaskAssignee);
  const taskTestDefaultType: 'developer' | 'uat' =
    role === 'developer' ? 'developer' : 'uat';

  const [users, tests, timeLogs, conversation, notes, attachments, insights] =
    await Promise.all([
      canManage ? listActiveUsers() : Promise.resolve([]),
      listTaskTests(task.id) as Promise<TaskTestRow[]>,
      listTaskTimeLogs(task.id) as Promise<TaskTimeLogRow[]>,
      listConversation('task', task.id) as Promise<ConversationRow[]>,
      listNotes('task', task.id) as Promise<NoteRow[]>,
      listAttachments('task', task.id) as Promise<AttachmentRow[]>,
      listAiInsights('task', task.id) as Promise<AiInsightRow[]>,
    ]);

  const priorityOptions = TASK_PRIORITIES.map((p) => ({
    value: p,
    label: TASK_PRIORITY_LABEL[p],
  }));
  const deliveryOptions = TASK_DELIVERY_STATES.map((d) => ({
    value: d,
    label: TASK_DELIVERY_STATE_LABEL[d],
  }));

  // Tests rollup (dev vs UAT pass counts).
  const devTests = tests.filter((t) => t.test_type === 'developer');
  const uatTests = tests.filter((t) => t.test_type === 'uat');
  const devPass = devTests.filter((t) => t.outcome === 'pass').length;
  const uatPass = uatTests.filter((t) => t.outcome === 'pass').length;

  // Own time logged → hours. time_reported_hours is the task's reported figure;
  // the time_logs sum is the viewer's OWN minutes (RLS-scoped). Show the reported
  // figure in the statstrip ("your effort"), and the per-day own logs in the card.
  const ownMinutes = timeLogs.reduce((s, l) => s + (l.minutes ?? 0), 0);
  const ownHours = ownMinutes / 60;

  const linkCount = attachments.filter((a) => a.kind === 'link').length;
  const fileCount = attachments.length - linkCount;

  const schedCls = scheduleStateClass(task.schedule_state);
  const schedVar =
    SCHEDULE_VARS[schedCls] ?? SCHEDULE_VARS['bg-subtle text-ink-secondary border-border-subtle'];

  const priorityVar = task.priority
    ? TASK_PRIORITY_TEXT_VAR[task.priority] ?? 'var(--color-text-primary)'
    : 'var(--color-text-tertiary)';

  return (
    <AppShell title="Task">
      <div data-testid="task-detail">
        {/* HEADER */}
        <div className="detail-head">
          <span className="tid">{task.display_id.replace(/^T-?/, 'T')}</span>
          <div className="dh-main">
            <div className="dh-title-row">
              <div data-testid="task-field-title" className="dh-name">
                <DetailHeaderTitle taskId={task.id} value={task.title} />
              </div>
              <StatusFieldEditor taskId={task.id} status={task.status} />
              {task.schedule_state && (
                <span
                  className="schedule"
                  style={{
                    background: schedVar.bg,
                    color: schedVar.text,
                    border: `1px solid ${schedVar.border}`,
                  }}
                >
                  <Clock size={13} />
                  {task.schedule_state}
                </span>
              )}
            </div>
            <div className="dh-sub">
              <span className="mono">{task.display_id}</span>
              {result.milestone && (
                <>
                  {' · '}
                  <Link href={`/milestones/${result.milestone.id}`}>
                    {result.milestone.name} ({result.milestone.display_id})
                  </Link>
                </>
              )}
              {/* Client (contact) identity ONLY in the full projection. The dev
                  shape carries no contact at all. */}
              {!result.is_dev && result.contact && (
                <>
                  {' · '}
                  <Link href={`/contacts/${result.contact.id}`}>
                    {result.contact.full_name}
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="spacer" />
          <button type="button" className="btn btn-secondary">
            <Pencil size={16} />
            Edit
          </button>
          {canManage && (
            <button type="button" className="btn btn-primary">
              <Plus size={16} />
              Create
            </button>
          )}
        </div>

        {/* STATSTRIP — priority / own time / tests / due (no money, no client) */}
        <div className="statstrip" style={{ marginBottom: 18 }}>
          <div className="stat">
            <div className="k">Priority</div>
            <div
              data-testid="priority-pill"
              className="v"
              style={{ fontSize: 18, color: priorityVar, fontFamily: 'var(--font-sans)' }}
            >
              {task.priority ? TASK_PRIORITY_LABEL[task.priority] : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="k">Time logged</div>
            <div className="v">{formatHours(task.time_reported_hours ?? ownHours)}</div>
            <div className="s">your effort</div>
          </div>
          <div className="stat">
            <div className="k">Tests</div>
            <div className="v">
              {devPass} / {devTests.length || 0}
            </div>
            <div className="s">dev passing</div>
          </div>
          <div className="stat">
            <div className="k">Due</div>
            <div className="v" style={{ fontSize: 16 }}>
              {task.plan_due_date ? formatDate(task.plan_due_date) : '—'}
            </div>
            {task.schedule_state && <div className="s">{task.schedule_state}</div>}
          </div>
        </div>

        <div className="dgrid">
          {/* LEFT — task meta (no money, no client) */}
          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h3>Task details</h3>
              </div>
              <div className="card-b" style={{ paddingTop: 8 }}>
                <div className="meta-row">
                  <span className="k">Task ID</span>
                  <span
                    className="mono"
                    style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}
                  >
                    {task.display_id}
                  </span>
                </div>
                {result.milestone && (
                  <div className="meta-row">
                    <span className="k">Milestone</span>
                    <div className="ie" data-ie="static">
                      <Link href={`/milestones/${result.milestone.id}`} style={{ fontSize: 14 }}>
                        {result.milestone.name} ({result.milestone.display_id})
                      </Link>
                    </div>
                  </div>
                )}
                {task.project_id && (
                  <div className="meta-row">
                    <span className="k">Project</span>
                    <div className="ie" data-ie="static">
                      <Link href={`/projects/${task.project_id}`} style={{ fontSize: 14 }}>
                        View project
                      </Link>
                    </div>
                  </div>
                )}

                <DetailInlineSelect
                  taskId={task.id}
                  field="priority"
                  label="Priority"
                  value={task.priority}
                  options={priorityOptions}
                  allowEmpty
                />
                <DetailInlineSelect
                  taskId={task.id}
                  field="delivery_state"
                  label="Delivery state"
                  value={task.delivery_state}
                  options={deliveryOptions}
                />
                <DetailInlineText
                  taskId={task.id}
                  field="start_date"
                  label="Start date"
                  value={task.start_date}
                  type="date"
                  mono
                />
                <DetailInlineText
                  taskId={task.id}
                  field="plan_due_date"
                  label="Due date"
                  value={task.plan_due_date}
                  type="date"
                  mono
                />
                <DetailInlineText
                  taskId={task.id}
                  field="time_reported_hours"
                  label="Time reported (hrs)"
                  value={
                    task.time_reported_hours !== null && task.time_reported_hours !== undefined
                      ? String(task.time_reported_hours)
                      : ''
                  }
                  type="number"
                  mono
                />

                <DetailAssigneesEditor
                  taskId={task.id}
                  assignees={result.assignees}
                  userOptions={users}
                />
                <DetailManagersEditor
                  taskId={task.id}
                  managers={result.managers}
                  userOptions={users}
                />
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
                {linkCount > 0 && (
                  <span className="cnt">
                    {linkCount} {linkCount === 1 ? 'link' : 'links'}
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
                    style={{ padding: 8, borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}
                  >
                    {a.kind === 'link' ? (
                      <Link2 size={18} style={{ color: 'var(--color-accent)' }} />
                    ) : (
                      <FileText size={18} style={{ color: 'var(--color-accent)' }} />
                    )}
                    <div className="t">
                      <div className="l1">{a.title}</div>
                      <div className="l2 mono">{a.kind === 'link' ? a.url : a.mime_type ?? 'file'}</div>
                    </div>
                    {a.kind === 'link' ? (
                      <ExternalLink size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    ) : (
                      <Download size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    )}
                  </a>
                ))}
                <TaskAttachmentsAdd taskId={task.id} />
              </div>
            </div>
          </div>

          {/* CENTER — requirement · discussion · tests */}
          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h3>Requirement</h3>
                <Pencil
                  size={14}
                  className="more"
                  style={{ color: 'var(--color-text-muted)' }}
                />
              </div>
              <div className="card-b">
                {task.requirement ? (
                  <p className="md" style={{ whiteSpace: 'pre-wrap' }}>
                    {task.requirement}
                  </p>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                    No requirement written yet.
                  </p>
                )}
              </div>
            </div>

            {/* Internal discussion (parent_type='task') */}
            <DiscussionThread taskId={task.id} entries={conversation} />

            {/* Dev + UAT tests */}
            <div className="card">
              <div className="card-h">
                <FlaskConical size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                <h3>Tests</h3>
                <span className="cnt">
                  dev {devPass}/{devTests.length} · UAT {uatPass}/{uatTests.length}
                </span>
              </div>
              <div>
                {tests.length === 0 ? (
                  <div className="card-b">
                    <p
                      data-testid="test-empty"
                      style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}
                    >
                      No tests yet.
                    </p>
                  </div>
                ) : (
                  tests.map((te) => {
                    const Icon =
                      te.outcome === 'pass'
                        ? CircleCheck
                        : te.outcome === 'fail'
                          ? CircleX
                          : CircleDashed;
                    const color =
                      te.outcome === 'pass'
                        ? 'var(--color-success-text)'
                        : te.outcome === 'fail'
                          ? 'var(--color-danger-text)'
                          : 'var(--color-text-muted)';
                    const canArchiveThis =
                      canRecordTaskTest || te.tester_user_id === uid;
                    return (
                      <div
                        className="test-row"
                        data-testid="test-row"
                        data-test-row-id={te.id}
                        key={te.id}
                      >
                        <Icon size={17} style={{ color }} />
                        <span
                          className="tag"
                          style={{ textTransform: 'uppercase', fontSize: 9, letterSpacing: '.05em' }}
                        >
                          {te.test_type === 'developer' ? 'DEV' : 'UAT'}
                        </span>
                        <span style={{ flex: 1, color: 'var(--color-text-primary)' }}>
                          {te.title ?? te.brief ?? 'Untitled test'}
                        </span>
                        {te.outcome === null && (
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                            pending
                          </span>
                        )}
                        {canArchiveThis && <ArchiveTestButton testId={te.id} />}
                      </div>
                    );
                  })
                )}
                {canRecordTaskTest && (
                  <div className="card-b" style={{ paddingTop: tests.length ? 10 : 0 }}>
                    <AddTestForm
                      parentType="task"
                      parentId={task.id}
                      defaultType={taskTestDefaultType}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — AI review · own time · notes */}
          <div className="stack">
            {/* AI Review */}
            <div className="card ai-card" data-testid="card-ai-insights">
              <div className="card-h" style={{ borderBottom: 0, paddingBottom: 4 }}>
                <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
                <h3>AI Review</h3>
              </div>
              <div
                className="card-b"
                style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {insights.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
                    No review yet.
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

            {/* Time logged — your OWN effort (RLS-scoped). Hours never feed
                completion. */}
            <div className="card">
              <div className="card-h">
                <h3>Time logged</h3>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  your effort
                </span>
              </div>
              <div className="card-b">
                {/* Total logged — the rollup aggregate (full projection only;
                    the developer projection v_task_dev carries no time column,
                    so developers never see it — the wall stays). */}
                {!result.is_dev && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      fontSize: 13,
                      marginBottom: 10,
                      paddingBottom: 10,
                      borderBottom: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      Total logged (all assignees)
                    </span>
                    <span
                      data-testid="time-log-total"
                      className="mono"
                      style={{ fontWeight: 600 }}
                    >
                      {formatHours(Number(result.task.time_spent_minutes ?? 0) / 60)}
                    </span>
                  </div>
                )}
                {timeLogs.length === 0 ? (
                  <p
                    data-testid="time-log-empty"
                    style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}
                  >
                    No time logged by you yet.
                  </p>
                ) : (
                  timeLogs.map((l) => (
                    <div
                      className="effort-row"
                      data-testid="time-log-row"
                      data-log-id={l.id}
                      key={l.id}
                    >
                      <span
                        className="avatar"
                        style={{
                          background: avatarBg(l.user_id),
                          width: 24,
                          height: 24,
                          fontSize: 10,
                          boxShadow: 'none',
                        }}
                      >
                        {initials(l.user_name)}
                      </span>
                      <span style={{ flex: 1, fontSize: 13 }}>
                        {l.user_name ?? 'You'}{' '}
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          · {formatDate(l.logged_for_date)}
                        </span>
                      </span>
                      <span className="mono" style={{ fontWeight: 500 }}>
                        {formatHours(l.minutes / 60)}
                      </span>
                      {canLogTime && <ArchiveTimeLogButton logId={l.id} />}
                    </div>
                  ))
                )}
                {canLogTime && (
                  <div style={{ marginTop: 10 }}>
                    <AddTimeLogForm taskId={task.id} />
                  </div>
                )}
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-muted)',
                    marginTop: 8,
                    lineHeight: 1.4,
                  }}
                >
                  You see your own hours. PMs see the aggregate across assignees. Hours never feed
                  completion.
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="card" data-testid="card-notes">
              <div className="card-h">
                <h3>Notes</h3>
                <span className="cnt">{notes.length}</span>
                <span className="more">
                  <TaskNotesAdd taskId={task.id} />
                </span>
              </div>
              <div className="card-b">
                {notes.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No notes yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        style={{ borderLeft: '2px solid var(--color-accent-border)', paddingLeft: 12 }}
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
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                          {n.author_name ?? 'Unknown'} · {formatDate(n.created_at)}
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
