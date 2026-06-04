import { Building2 } from 'lucide-react';
import { denyDevelopers } from '@/lib/guards';

import { AppShell } from '@/components/shell/AppShell';
import { CompanyFilters } from '@/components/companies/CompanyFilters';
import { CompaniesTable } from '@/components/companies/CompaniesTable';
import { CreateCompanyDialog } from '@/components/companies/CreateCompanyDialog';
import { listCompanies } from '@/lib/actions/companies';
import { listActiveUsers } from '@/lib/actions/directory';
import type { UserOption } from '@/lib/actions/directory';
import type { CompanyRollup } from '@/lib/types';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type SearchParams = {
  type?: string;
  account_owner_id?: string;
  search?: string;
};

// /companies — list. Server Component. Reads filters from searchParams, fetches
// via listCompanies (RLS-gated through asUser). Ports Companies.html into .sheet,
// mirroring the approved Contacts list. Developers are walled at the DB layer
// (companies has NO developer SELECT policy) → they see zero rows → empty state.
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await denyDevelopers();
  const sp = await searchParams;

  const filters = {
    type: sp.type || undefined,
    account_owner_id: sp.account_owner_id || undefined,
    search: sp.search || undefined,
  };

  const [companies, users] = await Promise.all([
    listCompanies(filters) as Promise<CompanyRollup[]>,
    listActiveUsers(),
  ]);

  const owners: Record<string, UserOption> = {};
  for (const u of users) owners[u.id] = u;

  const ownerOptions = users.map((u) => ({
    id: u.id,
    label: u.full_name ?? u.email ?? u.id,
  }));

  // Count line — computed from what the viewer can actually see.
  const total = companies.length;
  const activeClients = companies.filter((c) => c.type === 'client').length;
  const sub = `${total} ${total === 1 ? 'organization' : 'organizations'} · ${activeClients} active ${
    activeClients === 1 ? 'client' : 'clients'
  }`;

  return (
    <AppShell title="Companies">
      <div className="page-h">
        <div>
          <h1>Companies</h1>
          <div className="sub">{sub}</div>
        </div>
        <div className="spacer" />
        <CreateCompanyDialog />
      </div>

      {/* AI strip returns when wired to ai_insights. Omitted now — no AI data
          yet, and we don't fake it (same stance as the Contacts list). */}

      <CompanyFilters owners={ownerOptions} />

      {companies.length === 0 ? (
        <div className="tbl-wrap">
          <div data-testid="companies-empty" className="empty">
            <span className="ic" style={{ background: 'var(--color-accent-subtle)' }}>
              <Building2 size={26} aria-hidden style={{ color: 'var(--color-accent)' }} />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              No companies match these filters
            </div>
            <div
              style={{ fontSize: 13, color: 'var(--color-text-tertiary)', maxWidth: 340 }}
            >
              Try clearing a filter, or add a new organization.
            </div>
          </div>
        </div>
      ) : (
        <CompaniesTable companies={companies} owners={owners} />
      )}
    </AppShell>
  );
}
