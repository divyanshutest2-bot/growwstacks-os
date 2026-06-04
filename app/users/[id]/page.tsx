import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Kanban,
  GitFork,
  SquareCheck,
  Sparkles,
  TrendingUp,
  Info,
  TriangleAlert,
  FileText,
  Download,
  ExternalLink,
  Link2,
  Pencil,
} from 'lucide-react';

import '@/app/contact-detail.css';
import '@/app/user-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { UserHeaderName } from '@/components/users/UserHeaderName';
import { UserHeaderPills } from '@/components/users/UserHeaderPills';
import { UserDetailInlineText } from '@/components/users/UserDetailInlineField';
import { RoleStatusEditor } from '@/components/users/RoleStatusEditor';
import { ArchiveMenu } from '@/components/users/ArchiveMenu';
import { UserNotesAdd } from '@/components/users/UserNotesAdd';
import { UserAttachmentsAdd } from '@/components/users/UserAttachmentsAdd';

import {
  getUser,
  listUserAvailability,
  listUserWorkload,
  listUserExpertise,
} from '@/lib/actions/users';
import { listNotes, listAttachments, listAiInsights } from '@/lib/actions/polymorphic';
import { getCurrentUserRole } from '@/lib/auth';

import { initials, avatarBg, formatDate } from '@/lib/ui';
import {
  ROLE_LABEL,
  USER_STATUS_LABEL,
  USER_STATUS_DOT_VAR,
  PROFICIENCY_LABEL,
  formatRating,
  formatMinutes,
  toHours,
  toDateStr,
} from '@/lib/ui-users';
import { PROJECT_STATUS_LABEL } from '@/lib/ui-projects';
import { TASK_STATUS_LABEL } from '@/lib/ui-tasks';

import type {
  UserRollup,
  UserAvailabilityRow,
  UserWorkloadProjectRow,
  UserWorkloadTaskRow,
  UserExpertiseRow,
} from '@/lib/types-users';
import type { NoteRow, AttachmentRow, AiInsightRow } from '@/lib/types';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Sentiment → icon + color var for the AI Supervisor card.
const SENTIMENT_ICON = {
  positive: { Icon: TrendingUp, color: 'var(--color-ai-positive)' },
  neutral: { Icon: Info, color: 'var(--color-ai-neutral)' },
  risk: { Icon: TriangleAlert, color: 'var(--color-ai-risk)' },
} as const;

const DAY_LABELS = ['Today', 'Tomorrow', 'Day after'] as const;

// /users/[id] — the three-column team-member cockpit. Server Component; every read
// is RLS-gated via the server actions. Everyone can read the profile (directory is
// world-readable). Self-editable fields auto-save (RLS gates the row: admin OR own
// row). The role/status editor + Archive (the kill switch) render ONLY for an admin
// viewer — the UI gate; the fn_prevent_role_escalation trigger is the hard backstop.
export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, viewerRole] = await Promise.all([
    getUser(id) as Promise<UserRollup | null>,
    getCurrentUserRole(),
  ]);
  if (!user) notFound();

  const isAdmin = viewerRole === 'admin';

  // Fan out the rest of the cockpit reads (all RLS-gated).
  const [availability, workload, expertise, notes, attachments, insights] =
    await Promise.all([
      listUserAvailability(user.id) as Promise<UserAvailabilityRow[]>,
      listUserWorkload(user.id) as Promise<{
        projects: UserWorkloadProjectRow[];
        tasks: UserWorkloadTaskRow[];
      }>,
      listUserExpertise(user.id) as Promise<UserExpertiseRow[]>,
      listNotes('user', user.id) as Promise<NoteRow[]>,
      listAttachments('user', user.id) as Promise<AttachmentRow[]>,
      listAiInsights('user', user.id) as Promise<AiInsightRow[]>,
    ]);

  const { projects, tasks } = workload;

  const firstName = user.full_name?.trim().split(/\s+/)[0] ?? user.full_name ?? user.email;
  const statusDot = USER_STATUS_DOT_VAR[user.status] ?? 'var(--color-status-active)';

  // Tech expertise split by proficiency (app_links parent_type='user').
  const expert = expertise.filter((e) => e.proficiency === 'expert');
  const intermediate = expertise.filter((e) => e.proficiency === 'intermediate');

  // 3-day availability: index the rows by YYYY-MM-DD, then render today + next 2
  // days, filling gaps as "open" (no row = no recorded availability).
  const availByDate = new Map<string, number>();
  for (const a of availability) availByDate.set(toDateStr(a.date), toHours(a.available_hours));
  const today = new Date();
  const days = DAY_LABELS.map((label, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const hours = availByDate.get(key);
    return { label, hours: hours ?? null };
  });

  const linkCount = attachments.filter((a) => a.kind === 'link').length;
  const fileCount = attachments.length - linkCount;

  const shift =
    user.shift_start && user.shift_end
      ? `${String(user.shift_start).slice(0, 5)}–${String(user.shift_end).slice(0, 5)}`
      : '—';

  return (
    <AppShell title="User">
      <div data-testid="user-detail">
        {/* HEADER */}
        <div className="detail-head">
          <span className="wrap" style={{ position: 'relative', display: 'inline-block' }}>
            <span className="avatar lg" style={{ background: avatarBg(user.id) }}>
              {initials(user.full_name ?? user.email)}
            </span>
            <span
              style={{
                position: 'absolute',
                bottom: 1,
                right: 1,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: statusDot,
                boxShadow: '0 0 0 2.5px var(--color-bg-surface)',
              }}
            />
          </span>
          <div className="dh-main">
            <div className="dh-title-row">
              <div data-testid="user-field-full_name" className="dh-name">
                <UserHeaderName userId={user.id} value={user.full_name ?? user.email} />
              </div>
              <UserHeaderPills
                userId={user.id}
                role={user.role}
                status={user.status}
                isAdmin={isAdmin}
              />
            </div>
            <div className="dh-sub">
              <span className="mono" style={{ fontFamily: 'var(--font-mono)' }}>
                {user.display_id}
              </span>
              {user.job_title ? ` · ${user.job_title}` : ''} · joined{' '}
              {formatDate(user.created_at)}
            </div>
          </div>
          <div className="spacer" />
          <button type="button" className="btn btn-secondary">
            <Pencil size={16} />
            Edit
          </button>
          {isAdmin && (
            <ArchiveMenu userId={user.id} userName={user.full_name ?? user.email} />
          )}
        </div>

        {/* STAT STRIP */}
        <div className="statstrip" style={{ marginBottom: 18 }}>
          <div className="stat">
            <div className="k">Active tasks</div>
            <div className="v">{user.active_task_count ?? 0}</div>
          </div>
          <div className="stat">
            <div className="k">Projects</div>
            <div className="v">{user.project_count ?? 0}</div>
            <div className="s">as member</div>
          </div>
          <div className="stat">
            <div className="k">Avg rating</div>
            <div className="v" style={{ color: 'var(--color-success-text)' }}>
              {formatRating(user.avg_rating)}
            </div>
          </div>
          <div className="stat">
            <div className="k">Time this month</div>
            <div className="v">{formatMinutes(user.time_this_month_minutes)}</div>
          </div>
          <div className="stat">
            <div className="k">Status</div>
            <div className="v" style={{ fontSize: 16 }}>
              {USER_STATUS_LABEL[user.status] ?? user.status}
            </div>
          </div>
        </div>

        <div className="udgrid">
          {/* LEFT — profile, expertise, admin controls */}
          <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-h">
                <h3>Profile</h3>
              </div>
              <div className="card-b" style={{ paddingTop: 8 }}>
                <div className="meta-row">
                  <span className="k">User ID</span>
                  <span
                    className="mono"
                    style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}
                  >
                    {user.display_id}
                  </span>
                </div>
                <div className="meta-row" data-testid="user-field-email">
                  <span className="k">Email</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {user.email}
                  </span>
                </div>

                <UserDetailInlineText userId={user.id} field="phone" label="Phone" value={user.phone} mono />
                <UserDetailInlineText userId={user.id} field="whatsapp" label="WhatsApp" value={user.whatsapp} mono />
                <UserDetailInlineText userId={user.id} field="teams_id" label="Teams ID" value={user.teams_id} mono />
                <UserDetailInlineText
                  userId={user.id}
                  field="team_logger_id"
                  label="Team logger ID"
                  value={user.team_logger_id}
                  mono
                />
                <UserDetailInlineText userId={user.id} field="job_title" label="Job title" value={user.job_title} />
                <UserDetailInlineText
                  userId={user.id}
                  field="shift_start"
                  label="Shift start"
                  value={user.shift_start}
                  type="time"
                  mono
                />
                <UserDetailInlineText
                  userId={user.id}
                  field="shift_end"
                  label="Shift end"
                  value={user.shift_end}
                  type="time"
                  mono
                />
                <div className="meta-row">
                  <span className="k">Shift</span>
                  <span
                    className="mono"
                    style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}
                  >
                    {shift}
                  </span>
                </div>
              </div>
            </div>

            {/* Tech expertise (app_links proficiency) */}
            <div className="card">
              <div className="card-h">
                <h3>Tech expertise</h3>
              </div>
              <div className="card-b">
                {expertise.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                    No tech expertise recorded yet.
                  </p>
                ) : (
                  <>
                    {expert.length > 0 && (
                      <>
                        <div className="expert-label">{PROFICIENCY_LABEL.expert}</div>
                        <div className="expert" style={{ marginBottom: 12 }}>
                          {expert.map((e) => (
                            <span key={e.id} className="tag expert-tag">
                              {e.app_name}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {intermediate.length > 0 && (
                      <>
                        <div className="expert-label">{PROFICIENCY_LABEL.intermediate}</div>
                        <div className="expert">
                          {intermediate.map((e) => (
                            <span key={e.id} className="tag">
                              {e.app_name}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ADMIN-ONLY role/status editor — UI-gated; trigger is the backstop. */}
            {isAdmin && (
              <RoleStatusEditor userId={user.id} role={user.role} status={user.status} />
            )}

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
                <UserAttachmentsAdd userId={user.id} />
              </div>
            </div>
          </div>

          {/* CENTER — availability + workload */}
          <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-h">
                <h3>3-day availability</h3>
                {user.projects_requested > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    requested {user.projects_requested} more{' '}
                    {user.projects_requested === 1 ? 'project' : 'projects'}
                  </span>
                )}
              </div>
              <div className="card-b">
                <div className="avail">
                  {days.map((d) => {
                    // Three bars filled in proportion to free hours (0–8h scale).
                    const filled = d.hours == null ? 0 : Math.min(3, Math.round(d.hours / 3));
                    return (
                      <div className="day" key={d.label}>
                        <div className="dl">{d.label}</div>
                        <div className="bars">
                          {[0, 1, 2].map((b) => (
                            <span key={b} className={b < filled ? 'on' : undefined} />
                          ))}
                        </div>
                        <div className="free">
                          {d.hours == null ? 'open' : `~${d.hours}h free`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Working on (projects) */}
            <div className="card">
              <div className="card-h">
                <GitFork size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                <h3>Working on</h3>
                <span className="cnt">
                  {projects.length} {projects.length === 1 ? 'project' : 'projects'} · {tasks.length}{' '}
                  {tasks.length === 1 ? 'task' : 'tasks'}
                </span>
              </div>
              <div className="card-b" style={{ padding: '6px 14px' }}>
                {projects.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                    Not a member of any active project.
                  </p>
                ) : (
                  projects.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`} className="tree-row">
                      <Kanban size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                      <div className="t">
                        <div className="l1">{p.name}</div>
                        <div className="l2">
                          {p.display_id} · {Number(p.task_count ?? 0)}{' '}
                          {Number(p.task_count ?? 0) === 1 ? 'task' : 'tasks'}
                        </div>
                      </div>
                      <span className="status">{PROJECT_STATUS_LABEL[p.status] ?? p.status}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Assigned tasks */}
            <div className="card">
              <div className="card-h">
                <SquareCheck size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                <h3>Assigned tasks</h3>
                <span className="cnt">{tasks.length}</span>
              </div>
              <div className="card-b" style={{ padding: '6px 14px' }}>
                {tasks.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                    No open tasks assigned.
                  </p>
                ) : (
                  tasks.map((t) => {
                    const due = toDateStr(t.plan_due_date);
                    return (
                      <Link key={t.id} href={`/tasks/${t.id}`} className="urow">
                        <div className="t">
                          <div className="l1">{t.title}</div>
                          <div className="l2">
                            {t.project_name ? `${t.project_name} · ` : ''}
                            {t.display_id}
                          </div>
                        </div>
                        {due ? (
                          <span
                            className="schedule"
                            style={{
                              background: 'var(--color-warning-bg)',
                              color: 'var(--color-warning-text)',
                              border: '1px solid var(--color-warning-border)',
                            }}
                          >
                            Due {formatDate(due)}
                          </span>
                        ) : (
                          <span className="status">{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                        )}
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — AI, time spent, notes */}
          <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card ai-card" data-testid="card-ai-insights">
              <div className="card-h" style={{ borderBottom: 0, paddingBottom: 4 }}>
                <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
                <h3>AI Supervisor</h3>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)' }}>
                  on {firstName}
                </span>
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

            {/* Time spent (aggregate) */}
            <div className="card">
              <div className="card-h">
                <h3>Time spent</h3>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  aggregate (PM view)
                </span>
              </div>
              <div className="card-b">
                <div className="time-row">
                  <span className="l">This month</span>
                  <span className="v">{formatMinutes(user.time_this_month_minutes)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="card" data-testid="card-notes">
              <div className="card-h">
                <h3>Notes</h3>
                <span className="cnt">{notes.length}</span>
                <span className="more">
                  <UserNotesAdd userId={user.id} />
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
