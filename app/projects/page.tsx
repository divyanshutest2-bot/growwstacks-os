import { Kanban } from 'lucide-react';

import '@/app/project-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { ProjectFilters } from '@/components/projects/ProjectFilters';
import { ProjectsTable } from '@/components/projects/ProjectsTable';
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog';
import {
  listProjects,
  listMembersForProjects,
  listBillingForProjects,
  listDealOptions,
} from '@/lib/actions/projects';
import { listActiveUsers, listCompanies } from '@/lib/actions/directory';
import { getCurrentUserRole } from '@/lib/auth';
import type { ProjectListRow } from '@/lib/types-projects';

export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  member?: string;
  search?: string;
};

// /projects — list. Server Component. listProjects role-branches the view inside
// the action (developer → v_project_dev, partial; others → v_project_rollup).
// Mirrors the approved Contacts/Companies list (.page-h / .filterbar / .tbl).
//
// 🚨 PARTIAL DEVELOPER PROJECTION: a developer's rows physically lack money/client
// columns, AND the page passes showBilling=false + an empty billing map, so the
// list carries no billing column and no client identity. The "New project" dialog
// is shown only to admin/pm (RLS would reject sales/finance/developer anyway).
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const filters = {
    status: sp.status || undefined,
    member: sp.member || undefined,
    search: sp.search || undefined,
  };

  const role = await getCurrentUserRole();
  const canCreate = role === 'admin' || role === 'pm';
  const isDev = role === 'developer';

  const [projects, users, companies] = await Promise.all([
    listProjects(filters) as Promise<ProjectListRow[]>,
    listActiveUsers(),
    // Developers have no companies_select policy → empty; full roles get names
    // for the row sub-line. The dev rows carry no company_id anyway.
    isDev ? Promise.resolve([]) : listCompanies(),
  ]);

  const ids = projects.map((p) => p.id);

  // Deal options only matter for the create dialog (admin/pm). Billing only for
  // non-developer roles — the action hard-guards developers to an empty map.
  const [members, deals, billingRows] = await Promise.all([
    listMembersForProjects(ids),
    canCreate ? listDealOptions() : Promise.resolve([]),
    isDev ? Promise.resolve([]) : listBillingForProjects(ids),
  ]);

  const companyNames: Record<string, string> = {};
  for (const co of companies) companyNames[co.id] = co.name;

  const billing: Record<
    string,
    { agreed: string | number | null; currency: string | null }
  > = {};
  for (const b of billingRows)
    billing[b.project_id] = { agreed: b.agreed, currency: b.currency };

  const memberOptions = users.map((u) => ({
    id: u.id,
    label: u.full_name ?? u.email ?? u.id,
  }));

  // Count line — computed from what the viewer can actually see.
  const total = projects.length;
  const active = projects.filter((p) => p.status === 'in_progress').length;
  const sub = `${total} ${total === 1 ? 'project' : 'projects'} · ${active} in progress`;

  return (
    <AppShell title="Projects">
      <div className="page-h">
        <div>
          <h1>Projects</h1>
          <div className="sub">{sub}</div>
        </div>
        <div className="spacer" />
        {canCreate && <CreateProjectDialog deals={deals} />}
      </div>

      <ProjectFilters members={memberOptions} />

      {projects.length === 0 ? (
        <div className="tbl-wrap">
          <div data-testid="projects-empty" className="empty">
            <span
              className="ic"
              style={{ background: 'var(--color-accent-subtle)' }}
            >
              <Kanban
                size={26}
                aria-hidden
                style={{ color: 'var(--color-accent)' }}
              />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              No projects match these filters
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
                maxWidth: 340,
              }}
            >
              Try clearing a filter{canCreate ? ', or create your first project.' : '.'}
            </div>
          </div>
        </div>
      ) : (
        <ProjectsTable
          projects={projects}
          members={members}
          companyNames={companyNames}
          billing={billing}
          showBilling={!isDev}
        />
      )}
    </AppShell>
  );
}
