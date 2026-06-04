import { Handshake } from 'lucide-react';
import { denyDevelopers } from '@/lib/guards';

import '@/app/deals-board.css';

import { AppShell } from '@/components/shell/AppShell';
import { DealsFilterbar } from '@/components/deals/DealsFilterbar';
import { DealsViewToggle } from '@/components/deals/DealsViewToggle';
import { DealsBoard } from '@/components/deals/DealsBoard';
import { DealsListTable } from '@/components/deals/DealsListTable';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import {
  listDeals,
  listOwnersForDeals,
  listContactOptions,
} from '@/lib/actions/deals';
import { listActiveUsers, listCompanies } from '@/lib/actions/directory';
import { isOpenStage, stageProbability, formatMoneyCompact } from '@/lib/ui-deals';
import type { DealRollup } from '@/lib/types-deals';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type SearchParams = {
  stage?: string;
  owner?: string;
  search?: string;
};

// /deals — list. Server Component. Reads filters from searchParams, fetches via
// listDeals (RLS-gated through asUser; developers see ZERO). Ports Deals.html:
// a Kanban pipeline board + a Board⇄List toggle (List reuses the Contacts table
// style). No data route — every read is a server action.
export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await denyDevelopers();
  const sp = await searchParams;

  const filters = {
    stage: sp.stage || undefined,
    owner: sp.owner || undefined,
    search: sp.search || undefined,
  };

  const [deals, users, contacts, companies] = await Promise.all([
    listDeals(filters) as Promise<DealRollup[]>,
    listActiveUsers(),
    listContactOptions(),
    listCompanies(),
  ]);

  const owners = await listOwnersForDeals(deals.map((d) => d.id));

  const ownerOptions = users.map((u) => ({
    id: u.id,
    label: u.full_name ?? u.email ?? u.id,
  }));

  const companyNames: Record<string, string> = {};
  for (const co of companies) companyNames[co.id] = co.name;

  // Pipeline sub-line — computed from rows the viewer can actually see. "Open" =
  // any non-won/non-lost stage; weighted = Σ deal_value × stage probability.
  const open = deals.filter((d) => isOpenStage(d.stage));
  const currency = deals[0]?.currency ?? null;
  const weighted = open.reduce((acc, d) => {
    const v = d.deal_value == null ? 0 : Number(d.deal_value) || 0;
    return acc + (v * stageProbability(d.stage)) / 100;
  }, 0);
  const sub =
    deals.length === 0
      ? 'No deals yet'
      : `${open.length} open · ${formatMoneyCompact(weighted, currency)} weighted pipeline`;

  return (
    <AppShell title="Deals">
      <div className="page-h">
        <div>
          <h1>Deals</h1>
          <div className="sub">{sub}</div>
        </div>
        <div className="spacer" />
        <CreateDealDialog contacts={contacts} />
      </div>

      {/* AI strip returns wired to ai_insights once a pipeline-level insight
          model exists. Omitted now — we don't fabricate AI copy. */}

      <DealsFilterbar owners={ownerOptions} />

      {deals.length === 0 ? (
        <div className="tbl-wrap">
          <div data-testid="deals-empty" className="empty">
            <span
              className="ic"
              style={{ background: 'var(--color-accent-subtle)' }}
            >
              <Handshake
                size={26}
                aria-hidden
                style={{ color: 'var(--color-accent)' }}
              />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15 }}>No deals found</div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
                maxWidth: 340,
              }}
            >
              Adjust your filters, or create your first deal.
            </div>
          </div>
        </div>
      ) : (
        <DealsViewToggle
          board={
            <DealsBoard
              deals={deals}
              owners={owners}
              companyNames={companyNames}
            />
          }
          list={
            <DealsListTable
              deals={deals}
              owners={owners}
              companyNames={companyNames}
            />
          }
        />
      )}
    </AppShell>
  );
}
