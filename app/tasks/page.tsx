import { SquareCheck } from 'lucide-react';

import { AppShell } from '@/components/shell/AppShell';
import { TaskFilters } from '@/components/tasks/TaskFilters';
import { TasksTable } from '@/components/tasks/TasksTable';
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog';
import {
  listTasks,
  listAssigneesForTasks,
  listManagersForTasks,
  listMilestoneOptions,
} from '@/lib/actions/tasks';
import { listActiveUsers } from '@/lib/actions/directory';
import { getCurrentUserRole } from '@/lib/auth';
import type { TaskListRow } from '@/lib/types-tasks';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  assignee?: string;
  milestone?: string;
  search?: string;
};

// /tasks — global list. Server Component. Ports Tasks.html into the .sheet.
// listTasks role-branches the view INSIDE the action (developer → v_task_dev,
// partial — NO client identity; others → v_task_rollup). The table renders only
// columns common to both shapes, so a developer's partial rows carry no client
// identity. The "New task" dialog is shown only to admin/pm (sales/finance/
// developer cannot create — RLS rejects anyway).
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const filters = {
    status: sp.status || undefined,
    assignee: sp.assignee || undefined,
    milestone: sp.milestone || undefined,
    search: sp.search || undefined,
  };

  const role = await getCurrentUserRole();
  const canCreate = role === 'admin' || role === 'pm';

  const [tasks, users] = await Promise.all([
    listTasks(filters) as Promise<TaskListRow[]>,
    listActiveUsers(),
  ]);

  // Milestones populate the create dialog + the filter. Fetch for everyone (the
  // filter is shown to all roles); developers get only milestones RLS lets them
  // see, which is fine.
  const milestones = await listMilestoneOptions();

  const taskIds = tasks.map((t) => t.id);
  const [assignees, managers] = await Promise.all([
    listAssigneesForTasks(taskIds),
    listManagersForTasks(taskIds),
  ]);

  const userOptions = users.map((u) => ({
    id: u.id,
    label: u.full_name ?? u.email ?? u.id,
  }));
  const milestoneOptions = milestones.map((m) => ({
    id: m.id,
    label: `${m.name} (${m.display_id})`,
  }));

  // Count line — computed from the data the viewer can actually see. "Open" = not
  // done/lost. Project spread is the distinct project_id count.
  const total = tasks.length;
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'lost').length;
  const projectCount = new Set(
    tasks.map((t) => t.project_id).filter((p): p is string => !!p),
  ).size;
  const sub = `${open} open · ${total} total${
    projectCount > 0 ? ` across ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}` : ''
  }`;

  return (
    <AppShell title="Tasks">
      <div className="page-h">
        <div>
          <h1>Tasks</h1>
          <div className="sub">{sub}</div>
        </div>
        <div className="spacer" />
        {canCreate && <CreateTaskDialog milestones={milestones} />}
      </div>

      {/* AI strip returns wired to ai_insights in a later phase — omitted now (no
          AI data yet, and we don't fake it). */}

      <TaskFilters assignees={userOptions} milestones={milestoneOptions} />

      {tasks.length === 0 ? (
        <div className="tbl-wrap">
          <div data-testid="tasks-empty" className="empty">
            <span className="ic" style={{ background: 'var(--color-accent-subtle)' }}>
              <SquareCheck size={26} aria-hidden style={{ color: 'var(--color-accent)' }} />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15 }}>No tasks match these filters</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', maxWidth: 340 }}>
              Try clearing a filter, or create a task on a milestone.
            </div>
          </div>
        </div>
      ) : (
        <TasksTable tasks={tasks} assignees={assignees} managers={managers} />
      )}
    </AppShell>
  );
}
