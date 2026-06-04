import Link from 'next/link';

import {
  PROJECT_STATUS_LABEL,
  PROJECT_MEMBER_ROLE_LABEL,
  scheduleStateClass,
  formatPct,
} from '@/lib/ui-projects';
import {
  initials,
  avatarBg,
  USER_STATUS_DOT,
  formatINRLakhs,
} from '@/lib/ui';
import type { ProjectListRow } from '@/lib/types-projects';
import type { ProjectMemberRow } from '@/lib/actions/projects';

// Project status → dot color (mirrors the .status pill dot in the list design).
// Tokens-only; maps the project_status enum onto semantic status dots.
const STATUS_DOT: Record<string, string> = {
  upcoming: 'var(--color-info-solid)',
  in_progress: 'var(--iris-500)',
  client_pending: 'var(--color-info-solid)',
  on_hold: 'var(--color-warning-solid)',
  payment_pending: 'var(--color-warning-solid)',
  handover: 'var(--color-warning-solid)',
  completed: 'var(--color-success-solid)',
  internal: 'var(--n-400)',
  lost: 'var(--color-danger-solid)',
};

function pctNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function hoursLabel(minutes: string | number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes === '') return '—';
  const n = typeof minutes === 'string' ? Number(minutes) : minutes;
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${Math.round(n / 60)}h`;
}

// scheduleStateClass returns Tailwind utility classes; the list .schedule pill is
// styled via inline tokens, so derive a {bg,fg,bd} triple by prefix here instead.
function scheduleTone(state: string | null | undefined): {
  bg: string;
  fg: string;
  bd: string;
} {
  if (!state)
    return {
      bg: 'var(--color-bg-subtle)',
      fg: 'var(--color-text-secondary)',
      bd: 'var(--color-border-subtle)',
    };
  if (state.startsWith('Overdue'))
    return {
      bg: 'var(--color-danger-bg)',
      fg: 'var(--color-danger-text)',
      bd: 'var(--color-danger-border)',
    };
  if (state.startsWith('Due in'))
    return {
      bg: 'var(--color-warning-bg)',
      fg: 'var(--color-warning-text)',
      bd: 'var(--color-warning-border)',
    };
  if (state === 'Delivered')
    return {
      bg: 'var(--color-success-bg)',
      fg: 'var(--color-success-text)',
      bd: 'var(--color-success-border)',
    };
  return {
    bg: 'var(--color-info-bg)',
    fg: 'var(--color-info-text)',
    bd: 'var(--color-info-border)',
  };
}

// ProjectsTable — Server Component. Ports the approved Contacts list (.tbl) to
// projects, driven by real rows from EITHER projection: v_project_rollup (full
// roles) or v_project_dev (developers). The billing column renders ONLY when
// `showBilling` is true — for developers the page passes false AND the rows carry
// no money columns at all, so nothing can leak. Whole-row → /projects/[id].
export function ProjectsTable({
  projects,
  members,
  companyNames,
  billing,
  showBilling,
}: {
  projects: ProjectListRow[];
  members: ProjectMemberRow[];
  companyNames: Record<string, string>;
  billing: Record<string, { agreed: string | number | null; currency: string | null }>;
  showBilling: boolean;
}) {
  const membersByProject = new Map<string, ProjectMemberRow[]>();
  for (const m of members) {
    const list = membersByProject.get(m.project_id) ?? [];
    list.push(m);
    membersByProject.set(m.project_id, list);
  }

  return (
    <div className="tbl-wrap">
      <table data-testid="projects-table" className="tbl">
        <thead>
          <tr>
            <th>Project</th>
            <th>Status</th>
            <th>Schedule</th>
            <th>Completion</th>
            <th>Team</th>
            <th className="num">Milestones</th>
            <th className="num">Hours</th>
            {showBilling && <th className="num">Agreed</th>}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const rowMembers = membersByProject.get(p.id) ?? [];
            const company = p.company_id ? companyNames[p.company_id] : null;
            const pct = pctNum(p.completion_pct);
            const tone = scheduleTone(p.schedule_state);
            const bill = billing[p.id];

            const milestonesDone = p.milestones_done ?? null;
            const milestoneCount = p.milestone_count ?? null;

            return (
              <tr
                key={p.id}
                data-testid="project-row"
                style={{ position: 'relative' }}
              >
                {/* Project name + display_id + company sub */}
                <td>
                  <div className="cell-name">
                    <div>
                      <div className="nm">
                        <Link
                          href={`/projects/${p.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {p.name}
                        </Link>
                      </div>
                      <div
                        className="co mono"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {p.display_id}
                        {company ? ` · ${company}` : ''}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td>
                  <span data-testid="status-pill" className="status">
                    <span
                      className="dot"
                      style={{ background: STATUS_DOT[p.status] ?? 'var(--n-400)' }}
                    />
                    {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </td>

                {/* Schedule */}
                <td>
                  {p.schedule_state ? (
                    <span
                      className="schedule"
                      style={{
                        background: tone.bg,
                        color: tone.fg,
                        border: `1px solid ${tone.bd}`,
                      }}
                    >
                      {p.schedule_state}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>

                {/* Completion bar */}
                <td>
                  <div className="pct">
                    <div className="bar accent">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                    <span
                      className="mono"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {formatPct(p.completion_pct)}
                    </span>
                  </div>
                </td>

                {/* Team (PM + dev stack) */}
                <td>
                  {rowMembers.length === 0 ? (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  ) : (
                    <div className="ostack">
                      {rowMembers.map((m) => (
                        <span
                          key={m.user_id}
                          className="wrap"
                          title={`${m.full_name ?? ''} · ${
                            PROJECT_MEMBER_ROLE_LABEL[m.role] ?? m.role
                          }`}
                        >
                          <span
                            className="avatar"
                            style={{ background: avatarBg(m.user_id) }}
                          >
                            {initials(m.full_name)}
                          </span>
                          <span
                            className="sdot"
                            style={{
                              background:
                                USER_STATUS_DOT['active'] ??
                                'var(--color-status-active)',
                            }}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Milestones */}
                <td
                  className="num mono"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                >
                  {milestoneCount !== null ? (
                    `${milestonesDone ?? 0} / ${milestoneCount}`
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>

                {/* Hours */}
                <td
                  className="num mono"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {hoursLabel(p.time_spent_minutes)}
                </td>

                {/* Agreed (billing — non-developer only) */}
                {showBilling && (
                  <td
                    className="num mono"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {bill ? formatINRLakhs(bill.agreed) : '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
