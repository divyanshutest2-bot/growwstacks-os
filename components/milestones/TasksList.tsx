import Link from 'next/link';
import { Check, SquareCheck } from 'lucide-react';

import { avatarBg, initials, formatDate } from '@/lib/ui';
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_DOT,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_COLOR,
  scheduleStateClass,
} from '@/lib/ui-milestones';
import type { MilestoneTaskRow } from '@/lib/actions/milestones';

// TasksList — the milestone cockpit's center-of-gravity: the tasks under this
// milestone. Ports Milestone Detail.html's #taskList rows (.row-item: checkbox +
// name + priority + status + schedule + assignee avatar). Read-only here — task
// CRUD lives in the Tasks slice. Each row links to /tasks/[id]. Role-safe: the
// rows come from listMilestoneTasks, which reads v_task_dev for developers (client
// identity stripped).
export function TasksList({ tasks }: { tasks: MilestoneTaskRow[] }) {
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="card">
      <div className="card-h">
        <SquareCheck size={16} style={{ color: 'var(--color-text-tertiary)' }} />
        <h3>Tasks</h3>
        <span className="cnt">
          {done} / {tasks.length} done
        </span>
      </div>
      {tasks.length === 0 ? (
        <div className="card-b">
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            No tasks under this milestone yet.
          </p>
        </div>
      ) : (
        <div>
          {tasks.map((t) => {
            const isDone = t.status === 'done';
            const prio = t.priority ?? null;
            return (
              <div className="row-item" key={t.id}>
                <span className={`check-box${isDone ? ' done' : ''}`}>
                  {isDone && <Check size={12} />}
                </span>
                <Link
                  href={`/tasks/${t.id}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textDecoration: 'none',
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: isDone
                      ? 'var(--color-text-tertiary)'
                      : 'var(--color-text-primary)',
                    ...(isDone ? { textDecoration: 'line-through' } : {}),
                  }}
                >
                  {t.title}
                </Link>

                {prio && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: TASK_PRIORITY_COLOR[prio] ?? 'var(--color-text-tertiary)',
                    }}
                  >
                    {TASK_PRIORITY_LABEL[prio] ?? prio}
                  </span>
                )}

                <span className="status">
                  <span
                    className="dot"
                    style={{ background: TASK_STATUS_DOT[t.status] ?? 'var(--n-400)' }}
                  />
                  {TASK_STATUS_LABEL[t.status] ?? t.status}
                </span>

                {t.schedule_state ? (
                  <span className={`schedule ${scheduleStateClass(t.schedule_state)}`}>
                    {t.schedule_state}
                  </span>
                ) : t.plan_due_date ? (
                  <span
                    style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}
                  >
                    {formatDate(t.plan_due_date)}
                  </span>
                ) : null}

                {t.primary_pm_id && (
                  <span
                    className="avatar"
                    style={{
                      background: avatarBg(t.primary_pm_id),
                      width: 24,
                      height: 24,
                      fontSize: 10,
                      boxShadow: 'none',
                    }}
                    title={t.primary_pm_name ?? undefined}
                  >
                    {initials(t.primary_pm_name)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
