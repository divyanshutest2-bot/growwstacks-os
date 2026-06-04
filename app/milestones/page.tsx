import { Flag } from 'lucide-react';

import '@/app/milestone-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { MilestoneFilters } from '@/components/milestones/MilestoneFilters';
import { MilestonesTable } from '@/components/milestones/MilestonesTable';
import { CreateMilestoneDialog } from '@/components/milestones/CreateMilestoneDialog';
import {
  listMilestones,
  listMembersForMilestones,
  listProjectOptions,
} from '@/lib/actions/milestones';
import { getCurrentUserRole } from '@/lib/auth';
import type { MilestoneListRow } from '@/lib/types-milestones';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type SearchParams = {
  project_id?: string;
  status?: string;
  search?: string;
};

// /milestones — global list. Server Component. listMilestones role-branches the
// view inside the action (developer → v_milestone_dev, partial; others →
// v_milestone_rollup). The table renders the Value column ONLY for non-developers
// (showValue), so a developer's partial rows carry NO money/client. "New milestone"
// is shown only to admin/pm (sales/finance/developer cannot create — RLS rejects).
export default async function MilestonesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const filters = {
    project_id: sp.project_id || undefined,
    status: sp.status || undefined,
    search: sp.search || undefined,
  };

  const role = await getCurrentUserRole();
  const canCreate = role === 'admin' || role === 'pm';
  const showValue = role !== 'developer';

  // Project options drive BOTH the filter and the create dialog. A developer sees
  // only their member projects (RLS) — fine for filtering their own milestones.
  const [milestones, projects] = await Promise.all([
    listMilestones(filters) as Promise<MilestoneListRow[]>,
    listProjectOptions(),
  ]);

  const members = await listMembersForMilestones(milestones.map((m) => m.id));

  const projectOptions = projects.map((p) => ({
    id: p.id,
    label: `${p.name} (${p.display_id})`,
  }));

  // Count line — computed from the data the viewer can actually see.
  const total = milestones.length;
  const projectCount = new Set(
    milestones.map((m) => m.project_id).filter(Boolean),
  ).size;
  const sub = `${total} ${total === 1 ? 'milestone' : 'milestones'} across ${projectCount} ${
    projectCount === 1 ? 'project' : 'projects'
  }`;

  return (
    <AppShell title="Milestones">
      <div className="page-h">
        <div>
          <h1>Milestones</h1>
          <div className="sub">{sub}</div>
        </div>
        <div className="spacer" />
        {canCreate && <CreateMilestoneDialog projects={projects} />}
      </div>

      <MilestoneFilters projects={projectOptions} />

      {milestones.length === 0 ? (
        <div className="tbl-wrap">
          <div data-testid="milestones-empty" className="empty">
            <span
              className="ic"
              style={{ background: 'var(--color-accent-subtle)' }}
            >
              <Flag
                size={26}
                aria-hidden
                style={{ color: 'var(--color-accent)' }}
              />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              No milestones match these filters
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
                maxWidth: 340,
              }}
            >
              Try clearing a filter, or add a milestone to a project.
            </div>
          </div>
        </div>
      ) : (
        <MilestonesTable
          milestones={milestones}
          members={members}
          showValue={showValue}
        />
      )}
    </AppShell>
  );
}
