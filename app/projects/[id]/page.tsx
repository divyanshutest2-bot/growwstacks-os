import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  TrendingUp,
  Info,
  TriangleAlert,
  FileText,
  Download,
  ExternalLink,
  Link2,
  Clock,
  OctagonAlert,
  FlaskConical,
  CircleCheck,
  CircleX,
  CircleDashed,
  Flag,
  SquareCheck,
} from 'lucide-react';

import '@/app/contact-detail.css';
import '@/app/project-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { ProjectHeaderName } from '@/components/projects/ProjectHeaderName';
import { ProjectStatusPillEditor } from '@/components/projects/ProjectStatusPillEditor';
import {
  ProjectDetailInlineText,
  ProjectDetailInlineSelect,
} from '@/components/projects/ProjectDetailInlineField';
import { ProjectMembersEditor } from '@/components/projects/ProjectMembersEditor';
import { ProjectConversationThread } from '@/components/projects/ProjectConversationThread';
import { ProjectNotesAdd } from '@/components/projects/ProjectNotesAdd';
import { ProjectAttachmentsAdd } from '@/components/projects/ProjectAttachmentsAdd';
import { ProjectTabs } from '@/components/projects/ProjectTabs';
import { ArchiveMenu } from '@/components/projects/ArchiveMenu';

import {
  getProject,
  listProjectMilestones,
  listProjectTasks,
} from '@/lib/actions/projects';
import {
  listConversation,
  listNotes,
  listAttachments,
  listAiInsights,
} from '@/lib/actions/polymorphic';
import { listActiveUsers } from '@/lib/actions/directory';
import { listProjectTests, type ProjectTestRow } from '@/lib/actions/tests';
import { getCurrentUserRole } from '@/lib/auth';

import { initials, formatINRLakhs, formatDate, formatDateTime } from '@/lib/ui';
import {
  PROJECT_STATUS_LABEL,
  MILESTONE_LABELS,
  TASK_LABELS,
  formatPct,
} from '@/lib/ui-projects';

import type {
  ProjectDetail,
  ProjectMilestoneRow,
  ProjectTaskRow,
} from '@/lib/types-projects';
import type {
  ConversationRow,
  NoteRow,
  AttachmentRow,
  AiInsightRow,
} from '@/lib/types';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SENTIMENT_ICON = {
  positive: { Icon: TrendingUp, color: 'var(--color-ai-positive)' },
  neutral: { Icon: Info, color: 'var(--color-ai-neutral)' },
  risk: { Icon: TriangleAlert, color: 'var(--color-ai-risk)' },
} as const;

function pctNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function hoursLabel(minutes: string | number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes === '') return '—';
  const n = typeof minutes === 'string' ? Number(minutes) : minutes;
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n / 60)}h`;
}

// schedule_state → {bg,fg,bd} pill tone (mirrors the list helper).
function scheduleTone(state: string | null | undefined) {
  if (!state)
    return { bg: 'var(--color-bg-subtle)', fg: 'var(--color-text-secondary)', bd: 'var(--color-border-subtle)' };
  if (state.startsWith('Overdue'))
    return { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger-text)', bd: 'var(--color-danger-border)' };
  if (state.startsWith('Due'))
    return { bg: 'var(--color-warning-bg)', fg: 'var(--color-warning-text)', bd: 'var(--color-warning-border)' };
  if (state === 'Delivered' || state === 'Done')
    return { bg: 'var(--color-success-bg)', fg: 'var(--color-success-text)', bd: 'var(--color-success-border)' };
  return { bg: 'var(--color-info-bg)', fg: 'var(--color-info-text)', bd: 'var(--color-info-border)' };
}

const MS_TONE: Record<string, [string, string]> = {
  done: ['var(--color-success-bg)', 'var(--color-success-text)'],
  in_progress: ['var(--color-accent-subtle)', 'var(--color-accent-text)'],
  in_review: ['var(--color-accent-subtle)', 'var(--color-accent-text)'],
  on_hold: ['var(--color-warning-bg)', 'var(--color-warning-text)'],
  not_started: ['var(--color-bg-subtle)', 'var(--color-text-tertiary)'],
};
const MS_TONE_DEFAULT: [string, string] = [
  'var(--color-bg-subtle)',
  'var(--color-text-tertiary)',
];

function SchedulePill({ state }: { state: string | null | undefined }) {
  if (!state) return null;
  const t = scheduleTone(state);
  return (
    <span
      className="schedule"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}
    >
      {state}
    </span>
  );
}

// --- Milestones pane (shared by both projections; dev rows lack money) -------
function MilestonesPane({ milestones }: { milestones: ProjectMilestoneRow[] }) {
  if (milestones.length === 0) {
    return (
      <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        No milestones yet.
      </div>
    );
  }
  return (
    <div>
      {milestones.map((m, i) => {
        const tone = MS_TONE[m.status] ?? MS_TONE_DEFAULT;
        const pct = pctNum(m.completion_pct);
        return (
          <Link
            key={m.id}
            href={`/milestones/${m.id}`}
            className="row-item"
            style={{ textDecoration: 'none' }}
          >
            <span className="ms-num" style={{ background: tone[0], color: tone[1] }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                <div className="bar accent" style={{ flex: 1, maxWidth: 140 }}>
                  <div style={{ width: `${pct}%` }} />
                </div>
                <span
                  className="mono"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-tertiary)' }}
                >
                  {pct}%
                </span>
              </div>
            </div>
            {m.status === 'done' ? (
              <SchedulePill state="Done" />
            ) : (
              <span className="status">{MILESTONE_LABELS[m.status] ?? m.status}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// --- Tasks pane (full = all tasks; dev = "My tasks") -------------------------
function TasksPane({ tasks }: { tasks: ProjectTaskRow[] }) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        No tasks here.
      </div>
    );
  }
  return (
    <div>
      {tasks.map((t) => {
        const done = t.status === 'done';
        return (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            className="row-item"
            style={{ textDecoration: 'none' }}
          >
            <span className={`check${done ? ' done' : ''}`} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  ...(done
                    ? { color: 'var(--color-text-tertiary)', textDecoration: 'line-through' }
                    : {}),
                }}
              >
                {t.title}
              </div>
            </div>
            <span className="status">{TASK_LABELS[t.status] ?? t.status}</span>
            {t.schedule_state ? <SchedulePill state={t.schedule_state} /> : null}
          </Link>
        );
      })}
    </div>
  );
}

// --- Tests pane — aggregated dev/UAT tests across the project's milestones &
// tasks (read; membership-based RLS makes it role-safe for both projections;
// tests carry no money/client columns). Recording happens on the milestone/task
// cockpits, not here. ----------------------------------------------------------
function TestsPane({ tests }: { tests: ProjectTestRow[] }) {
  if (tests.length === 0) {
    return (
      <div className="pane-empty">
        <div className="ic">
          <FlaskConical size={24} style={{ color: 'var(--color-accent)' }} />
        </div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>No tests recorded yet</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', maxWidth: 320 }}>
          Record the first test on a milestone or task to populate this pane.
        </div>
      </div>
    );
  }
  return (
    <div>
      {tests.map((te) => {
        const pass = te.outcome === 'pass';
        const fail = te.outcome === 'fail';
        const Icon = pass ? CircleCheck : fail ? CircleX : CircleDashed;
        const color = pass
          ? 'var(--color-success-text)'
          : fail
            ? 'var(--color-danger-text)'
            : 'var(--color-text-muted)';
        return (
          <div
            data-testid="project-test-row"
            key={te.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0',
              borderTop: '1px solid var(--color-border-subtle)',
              fontSize: 13,
            }}
          >
            <Icon size={17} style={{ color }} />
            <span
              className="tag"
              style={{ textTransform: 'uppercase', fontSize: 9, letterSpacing: '.05em' }}
            >
              {te.test_type === 'developer' ? 'DEV' : 'UAT'}
            </span>
            <span style={{ flex: 1, color: 'var(--color-text-primary)' }}>
              {te.title ?? 'Untitled test'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {te.parent_label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- AI Supervisor card (shared) ---------------------------------------------
function AiCard({ insights, label }: { insights: AiInsightRow[]; label: string }) {
  return (
    <div className="card ai-card" data-testid="card-ai-insights">
      <div className="card-h" style={{ borderBottom: 0, paddingBottom: 4 }}>
        <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
        <h3>AI Supervisor</h3>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)' }}>
          {label}
        </span>
      </div>
      <div className="card-b" style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {insights.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No insights yet</p>
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
  );
}

// --- Notes card (shared) -----------------------------------------------------
function NotesCard({ notes, projectId }: { notes: NoteRow[]; projectId: string }) {
  return (
    <div className="card" data-testid="card-notes">
      <div className="card-h">
        <h3>Notes</h3>
        <span className="cnt">{notes.length}</span>
        <span className="more">
          <ProjectNotesAdd projectId={projectId} />
        </span>
      </div>
      <div className="card-b">
        {notes.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No notes yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {notes.map((n) => (
              <div key={n.id} style={{ borderLeft: '2px solid var(--color-accent-border)', paddingLeft: 12 }}>
                {n.title && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{n.title}</div>}
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
  );
}

// --- Attachments card (shared) -----------------------------------------------
function AttachmentsCard({
  attachments,
  projectId,
}: {
  attachments: AttachmentRow[];
  projectId: string;
}) {
  const linkCount = attachments.filter((a) => a.kind === 'link').length;
  const fileCount = attachments.length - linkCount;
  return (
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
              <FileText size={18} style={{ color: 'var(--color-danger-fg)' }} />
            )}
            <div className="t">
              <div className="l1">{a.title}</div>
              <div className="l2 mono" style={{ fontFamily: 'var(--font-mono)' }}>
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
        <ProjectAttachmentsAdd projectId={projectId} />
      </div>
    </div>
  );
}

// /projects/[id] — the Project cockpit. Server Component; all data via getProject
// + related reads, every one RLS-gated and role-branched.
//
// 🚨 The page renders DIFFERENTLY by data shape (result.is_dev):
//   developer  → the DELIVERY cockpit per "Project (Developer view).html":
//                completion=task-count + hours separate, NO billing card, NO
//                client/deal/company, tabs Milestones / My tasks / Tests.
//   full       → the cockpit per index.html: billing stat strip + Billing card,
//                client/company sub-line, members, Conversation, AI, etc.
//
// getProject returns null when RLS denies the row (a non-member developer) →
// notFound(), indistinguishable from not-found by design.
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = (await getProject(id)) as ProjectDetail | null;
  if (!result) notFound();

  const role = await getCurrentUserRole();
  const canManage = role === 'admin' || role === 'pm';
  const project = result.project;

  // Fan out the cockpit reads. listProjectTasks role-branches (dev → "My tasks").
  // The Conversation is FULL-projection ONLY — the developer delivery cockpit has
  // no client conversation surface, so it is not even fetched for a developer.
  const [
    users,
    milestones,
    tasks,
    notes,
    attachments,
    insights,
    conversation,
    projectTests,
  ] = await Promise.all([
    canManage ? listActiveUsers() : Promise.resolve([]),
    listProjectMilestones(project.id) as Promise<ProjectMilestoneRow[]>,
    listProjectTasks(project.id) as Promise<ProjectTaskRow[]>,
    listNotes('project', project.id) as Promise<NoteRow[]>,
    listAttachments('project', project.id) as Promise<AttachmentRow[]>,
    listAiInsights('project', project.id) as Promise<AiInsightRow[]>,
    result.is_dev
      ? Promise.resolve([] as ConversationRow[])
      : (listConversation('project', project.id) as Promise<ConversationRow[]>),
    listProjectTests(project.id) as Promise<ProjectTestRow[]>,
  ]);

  const pct = pctNum(project.completion_pct);
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const doneMilestones = milestones.filter((m) => m.status === 'done').length;
  const firstName = project.name?.trim().split(/\s+/)[0] ?? project.name;
  const blockers = insights.filter((i) => i.kind === 'blocker' && i.is_active !== false);
  // time_spent_minutes is a rollup-only column — absent on the developer view.
  const timeMinutes = result.is_dev ? null : result.project.time_spent_minutes ?? null;

  return (
    <AppShell title="Project">
      <div data-testid="project-detail">
        {/* HEADER */}
        <div className="phead">
          <div className="ptitle-row">
            <div style={{ minWidth: 0 }}>
              {/* Inline-editable NAME (Playwright edits this on the full path) */}
              <div data-testid="project-field-name" className="p-name">
                {canManage ? (
                  <ProjectHeaderName projectId={project.id} value={project.name} />
                ) : (
                  <span className="ptitle">{project.name}</span>
                )}
              </div>
              <div className="pid">
                {project.display_id}
                {!result.is_dev && result.contact ? (
                  <>
                    {' · '}
                    <Link href={`/contacts/${result.contact.id}`}>
                      {result.contact.full_name}
                    </Link>
                  </>
                ) : null}
                {!result.is_dev && result.deal ? (
                  <>
                    {' · '}
                    <Link href={`/deals/${result.deal.id}`}>{result.deal.name}</Link>
                  </>
                ) : null}
                {result.is_dev ? (
                  <>
                    {' · started '}
                    {formatDate(project.start_date)}
                    {' · est. completion '}
                    {formatDate(project.estimated_completion_date)}
                  </>
                ) : null}
              </div>
            </div>
            <div className="spacer" />
            <div className="badge-row">
              <ProjectStatusPillEditor
                projectId={project.id}
                status={project.status}
                editable={canManage}
              />
              {project.schedule_state ? (
                <span
                  className="schedule"
                  style={{
                    background: scheduleTone(project.schedule_state).bg,
                    color: scheduleTone(project.schedule_state).fg,
                    border: `1px solid ${scheduleTone(project.schedule_state).bd}`,
                  }}
                >
                  <Clock size={13} />
                  {project.schedule_state}
                </span>
              ) : null}
              {canManage && <ArchiveMenu projectId={project.id} />}
            </div>
          </div>

          {/* STAT STRIP — money/milestones for full; delivery-only for dev. */}
          {result.is_dev ? (
            <div className="statstrip">
              <div className="stat">
                <div className="k">Completion</div>
                <div className="v" style={{ color: 'var(--color-accent-text)' }}>
                  {formatPct(project.completion_pct)}
                </div>
                <div className="s">by task count</div>
              </div>
              <div className="stat">
                <div className="k">My tasks</div>
                <div className="v">
                  {doneTasks} / {tasks.length}
                </div>
                <div className="s">done</div>
              </div>
              <div className="stat">
                <div className="k">Milestones</div>
                <div className="v">
                  {doneMilestones} / {milestones.length}
                </div>
                <div className="s">on track</div>
              </div>
              <div className="stat">
                <div className="k">Est. hours</div>
                <div className="v">{hoursLabel(Number(project.estimated_hours) * 60)}</div>
                <div className="s">planned for this project</div>
              </div>
              <div className="stat">
                <div className="k">Schedule</div>
                <div className="v" style={{ color: 'var(--color-warning-text)' }}>
                  {project.schedule_state ?? '—'}
                </div>
                <div className="s">to estimated date</div>
              </div>
            </div>
          ) : (
            <div className="statstrip">
              <div className="stat">
                <div className="k">Agreed</div>
                <div className="v">{formatINRLakhs(result.billing?.agreed)}</div>
                <div className="s">contract value</div>
              </div>
              <div className="stat">
                <div className="k">Received</div>
                <div className="v" style={{ color: 'var(--color-success-text)' }}>
                  {formatINRLakhs(result.billing?.received)}
                </div>
                <div className="s">
                  {result.billing?.pct_collected != null
                    ? `${formatPct(result.billing.pct_collected)} collected`
                    : 'collected'}
                </div>
              </div>
              <div className="stat">
                <div className="k">Outstanding</div>
                <div className="v" style={{ color: 'var(--color-warning-text)' }}>
                  {formatINRLakhs(result.billing?.outstanding)}
                </div>
                <div className="s">remaining</div>
              </div>
              <div className="stat">
                <div className="k">Milestones</div>
                <div className="v">
                  {result.project.milestones_done ?? doneMilestones} /{' '}
                  {result.project.milestone_count ?? milestones.length}
                </div>
                <div className="s">delivered</div>
              </div>
              <div className="stat">
                <div className="k">Completion</div>
                <div className="v" style={{ color: 'var(--color-accent-text)' }}>
                  {formatPct(project.completion_pct)}
                </div>
                <div className="s">by task count</div>
              </div>
            </div>
          )}
        </div>

        <div className="pcols">
          {/* LEFT META */}
          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h3>Details</h3>
              </div>
              <div className="card-b" style={{ paddingTop: 8 }}>
                <div className="meta-row">
                  <span className="k">Project ID</span>
                  <span
                    className="mono"
                    style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}
                  >
                    {project.display_id}
                  </span>
                </div>

                {!result.is_dev && result.contact ? (
                  <div className="meta-row">
                    <span className="k">Client</span>
                    <div className="ie" data-ie="static">
                      <Link href={`/contacts/${result.contact.id}`} style={{ fontSize: 14 }}>
                        {result.contact.full_name}
                      </Link>
                    </div>
                  </div>
                ) : null}
                {!result.is_dev && result.deal ? (
                  <div className="meta-row">
                    <span className="k">Linked deal</span>
                    <div className="ie" data-ie="static">
                      <Link href={`/deals/${result.deal.id}`} style={{ fontSize: 14 }}>
                        {result.deal.display_id} · {result.deal.name}
                      </Link>
                    </div>
                  </div>
                ) : null}

                <ProjectDetailInlineText
                  projectId={project.id}
                  field="start_date"
                  label="Start date"
                  value={project.start_date}
                  type="date"
                  mono
                  readOnly={!canManage}
                />
                <ProjectDetailInlineText
                  projectId={project.id}
                  field="estimated_completion_date"
                  label="Est. completion"
                  value={project.estimated_completion_date}
                  type="date"
                  mono
                  readOnly={!canManage}
                />
                <ProjectDetailInlineText
                  projectId={project.id}
                  field="estimated_hours"
                  label="Estimated hours"
                  value={project.estimated_hours != null ? String(project.estimated_hours) : null}
                  type="number"
                  mono
                  readOnly={!canManage}
                />
                <ProjectDetailInlineText
                  projectId={project.id}
                  field="team_logger_project_id"
                  label="Team Logger ID"
                  value={project.team_logger_project_id}
                  mono
                  readOnly={!canManage}
                />
              </div>
            </div>

            {/* Owners / team */}
            {canManage ? (
              <ProjectMembersEditor
                projectId={project.id}
                members={result.members}
                userOptions={users}
              />
            ) : (
              <div className="card">
                <div className="card-h">
                  <h3>Team</h3>
                </div>
                <div className="card-b">
                  {result.members.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                      No team members listed.
                    </p>
                  ) : (
                    <div className="ostack">
                      {result.members.map((m) => (
                        <span
                          key={m.user_id}
                          className="wrap"
                          data-testid="member-chip"
                          title={m.full_name ?? m.email ?? m.user_id}
                        >
                          <span className="avatar">{initials(m.full_name ?? m.email)}</span>
                          <span className="sdot" style={{ background: 'var(--color-status-active)' }} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <AttachmentsCard attachments={attachments} projectId={project.id} />
          </div>

          {/* CENTER */}
          <div className="stack">
            {result.is_dev ? (
              <>
                {project.overview ? (
                  <div className="card">
                    <div className="card-h">
                      <h3>Overview</h3>
                    </div>
                    <div className="card-b">
                      <p className="md">{project.overview}</p>
                    </div>
                  </div>
                ) : null}
                {project.requirement ? (
                  <div className="card">
                    <div className="card-h">
                      <h3>Requirement</h3>
                    </div>
                    <div className="card-b">
                      <p className="md">{project.requirement}</p>
                    </div>
                  </div>
                ) : null}
                {blockers.length > 0 ? (
                  <div className="card">
                    <div className="card-h">
                      <OctagonAlert size={16} style={{ color: 'var(--color-warning-fg)' }} />
                      <h3>Blockers</h3>
                      <span className="cnt">{blockers.length} open</span>
                    </div>
                    <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {blockers.map((b) => (
                        <div className="blocker" key={b.id}>
                          <span className="ic" style={{ background: 'var(--color-warning-bg)' }}>
                            <TriangleAlert size={15} style={{ color: 'var(--color-warning-fg)' }} />
                          </span>
                          <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
                            {b.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <ProjectConversationThread
                projectId={project.id}
                projectName={project.name}
                entries={conversation}
              />
            )}

            <ProjectTabs
              tabs={[
                {
                  key: 'milestones',
                  label: 'Milestones',
                  count: milestones.length,
                  content: <MilestonesPane milestones={milestones} />,
                },
                {
                  key: 'tasks',
                  label: result.is_dev ? 'My tasks' : 'Tasks',
                  count: tasks.length,
                  content: <TasksPane tasks={tasks} />,
                },
                {
                  key: 'tests',
                  label: 'Tests',
                  count: projectTests.length,
                  content: <TestsPane tests={projectTests} />,
                },
              ]}
            />
          </div>

          {/* RIGHT RAIL */}
          <div className="stack">
            <AiCard insights={insights} label={result.is_dev ? 'delivery' : `on ${firstName}`} />

            {/* COMPLETION — shown to BOTH projections (card-completion testid). */}
            <div className="card" data-testid="card-completion">
              <div className="card-h">
                <h3>Completion</h3>
              </div>
              <div className="card-b">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 36,
                      fontWeight: 800,
                      color: 'var(--color-accent-text)',
                      lineHeight: 1,
                    }}
                  >
                    {formatPct(project.completion_pct)}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                    {doneTasks} / {tasks.length} tasks
                  </span>
                </div>
                <div className="bar accent" style={{ marginBottom: 14 }}>
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    padding: '5px 0',
                    borderTop: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-secondary)' }}>Milestones</span>
                  <span className="mono" style={{ fontFamily: 'var(--font-mono)' }}>
                    {doneMilestones} / {milestones.length}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    padding: '5px 0',
                    borderTop: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-secondary)' }}>Time logged</span>
                  <span className="mono" style={{ fontFamily: 'var(--font-mono)' }}>
                    {hoursLabel(timeMinutes)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                  Completion tracks task count. Hours are a separate effort signal.
                </div>
              </div>
            </div>

            {/* BILLING — FULL projection ONLY. Developer path NEVER renders this. */}
            {!result.is_dev && (
              <div className="card" data-testid="card-billing">
                <div className="card-h">
                  <h3>Billing</h3>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {result.billing?.pct_collected != null
                      ? `${formatPct(result.billing.pct_collected)} collected`
                      : '—'}
                  </span>
                </div>
                <div className="card-b">
                  <div className="bar" style={{ marginBottom: 14 }}>
                    <div style={{ width: `${pctNum(result.billing?.pct_collected)}%` }} />
                  </div>
                  <div className="bill-row" style={{ borderTop: 0, paddingTop: 0 }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Agreed</span>
                    <span className="v">{formatINRLakhs(result.billing?.agreed)}</span>
                  </div>
                  <div className="bill-row">
                    <span style={{ color: 'var(--color-text-secondary)' }}>Received</span>
                    <span className="v" style={{ color: 'var(--color-success-text)' }}>
                      {formatINRLakhs(result.billing?.received)}
                    </span>
                  </div>
                  <div className="bill-row">
                    <span style={{ color: 'var(--color-text-secondary)' }}>Outstanding</span>
                    <span className="v" style={{ color: 'var(--color-warning-text)' }}>
                      {formatINRLakhs(result.billing?.outstanding)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <NotesCard notes={notes} projectId={project.id} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
