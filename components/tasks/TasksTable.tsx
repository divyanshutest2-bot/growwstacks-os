import Link from 'next/link';

import {
  TASK_STATUS_LABEL,
  TASK_STATUS_DOT,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_PILL,
  scheduleStateClass,
  formatHours,
} from '@/lib/ui-tasks';
import { avatarBg, initials, formatDate } from '@/lib/ui';
import type { TaskListRow } from '@/lib/types-tasks';
import type { TaskAssigneeRow } from '@/lib/actions/tasks';

// TasksTable — Server Component. Ports Tasks.html's .tbl faithfully, driven by
// real rows from EITHER projection (v_task_rollup for full roles, v_task_dev for
// developers). It reads ONLY columns present in BOTH shapes — title, display_id,
// status, priority, delivery_state, schedule_state — so a developer's partial row
// renders the SAME table with NO client identity to leak. Each row is whole-row
// clickable via a stretched <Link> over the Task name cell.
//
// Effort (logged hours) is shown in its OWN column and NEVER feeds completion —
// it is a separate signal (a read-only display of time_reported_hours).

// Map the design's schedule-pill class string to the inline token vars the
// shell's .schedule helper expects (bg / text / border).
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

const PRIORITY_VARS: Record<string, { bg: string; text: string; border: string }> = {
  'bg-danger-bg text-danger-text border-danger-border': {
    bg: 'var(--color-danger-bg)',
    text: 'var(--color-danger-text)',
    border: 'var(--color-danger-border)',
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

export function TasksTable({
  tasks,
  assignees,
  managers,
}: {
  tasks: TaskListRow[];
  assignees: TaskAssigneeRow[];
  managers?: TaskAssigneeRow[];
}) {
  const assigneesByTask = new Map<string, TaskAssigneeRow[]>();
  for (const a of assignees) {
    const list = assigneesByTask.get(a.task_id) ?? [];
    list.push(a);
    assigneesByTask.set(a.task_id, list);
  }

  const managersByTask = new Map<string, TaskAssigneeRow[]>();
  for (const m of managers ?? []) {
    const list = managersByTask.get(m.task_id) ?? [];
    list.push(m);
    managersByTask.set(m.task_id, list);
  }

  return (
    <div className="tbl-wrap">
      <table data-testid="tasks-table" className="tbl">
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Delivery</th>
            <th>Assignees</th>
            <th>Manager</th>
            <th className="num">Due</th>
            <th className="num">Effort</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const rowAssignees = assigneesByTask.get(t.id) ?? [];
            const rowManagers = managersByTask.get(t.id) ?? [];

            const prioCls =
              (t.priority && TASK_PRIORITY_PILL[t.priority]) ??
              'bg-subtle text-ink-secondary border-border-subtle';
            const prioVar =
              PRIORITY_VARS[prioCls] ?? PRIORITY_VARS['bg-subtle text-ink-secondary border-border-subtle'];

            const schedCls = scheduleStateClass(t.schedule_state);
            const schedVar =
              SCHEDULE_VARS[schedCls] ?? SCHEDULE_VARS['bg-subtle text-ink-secondary border-border-subtle'];

            const delivered = t.delivery_state === 'delivered';

            return (
              <tr key={t.id} data-testid="task-row" style={{ position: 'relative' }}>
                {/* Task */}
                <td>
                  <div className="cell-name">
                    <span
                      className="mono"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 600,
                        flex: 'none',
                        background: 'var(--color-bg-subtle)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {t.display_id}
                    </span>
                    <div>
                      <div className="nm">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {t.title}
                        </Link>
                      </div>
                      <div className="co mono">{t.display_id}</div>
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td>
                  <span data-testid="status-pill" className="status">
                    <span
                      className="dot"
                      style={{ background: TASK_STATUS_DOT[t.status] ?? 'var(--n-400)' }}
                    />
                    {TASK_STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </td>

                {/* Priority */}
                <td>
                  {t.priority ? (
                    <span
                      data-testid="priority-pill"
                      className="status"
                      style={{
                        background: prioVar.bg,
                        color: prioVar.text,
                        borderColor: prioVar.border,
                      }}
                    >
                      {TASK_PRIORITY_LABEL[t.priority] ?? t.priority}
                    </span>
                  ) : (
                    <span data-testid="priority-pill" style={{ color: 'var(--color-text-muted)' }}>
                      —
                    </span>
                  )}
                </td>

                {/* Delivery state */}
                <td>
                  {t.schedule_state ? (
                    <span
                      className="schedule"
                      style={{
                        background: schedVar.bg,
                        color: schedVar.text,
                        border: `1px solid ${schedVar.border}`,
                      }}
                    >
                      {t.schedule_state}
                    </span>
                  ) : (
                    <span
                      className="status"
                      style={{
                        background: delivered ? 'var(--color-success-bg)' : 'var(--color-bg-subtle)',
                        color: delivered
                          ? 'var(--color-success-text)'
                          : 'var(--color-text-secondary)',
                        borderColor: 'transparent',
                      }}
                    >
                      {delivered ? 'Delivered' : 'Not delivered'}
                    </span>
                  )}
                </td>

                {/* Assignees */}
                <td>
                  {rowAssignees.length === 0 ? (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  ) : (
                    <div className="ostack">
                      {rowAssignees.map((a) => (
                        <span key={a.user_id} className="wrap" title={a.full_name ?? undefined}>
                          <span className="avatar" style={{ background: avatarBg(a.user_id) }}>
                            {initials(a.full_name)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Manager */}
                <td>
                  {rowManagers.length === 0 ? (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  ) : (
                    <div className="ostack">
                      {rowManagers.map((m) => (
                        <span key={m.user_id} className="wrap" title={m.full_name ?? undefined}>
                          <span
                            className="avatar"
                            style={{ background: avatarBg(m.user_id), width: 24, height: 24, fontSize: 10 }}
                          >
                            {initials(m.full_name)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Due */}
                <td className="num mono" style={{ color: 'var(--color-text-secondary)' }}>
                  {t.plan_due_date ? formatDate(t.plan_due_date) : '—'}
                </td>

                {/* Effort (separate signal — never feeds completion) */}
                <td className="num" style={{ color: 'var(--color-text-tertiary)' }}>
                  {formatHours(t.time_reported_hours)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
