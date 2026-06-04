import { Contact } from 'lucide-react';
import { denyDevelopers } from '@/lib/guards';

import { AppShell } from '@/components/shell/AppShell';
import { ContactFilters } from '@/components/contacts/ContactFilters';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { CreateContactDialog } from '@/components/contacts/CreateContactDialog';
import { listContacts } from '@/lib/actions/contacts';
import {
  listActiveUsers,
  listCompanies,
  listOwnersForContacts,
  listLeadSourcesForContacts,
} from '@/lib/actions/directory';
import type { ContactRollup } from '@/lib/types';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  primary_owner_id?: string;
  company_id?: string;
  search?: string;
};

// /contacts — list. Server Component. Reads filters from searchParams, fetches
// via listContacts (RLS-gated through asUser). Ports Contacts.html into .sheet.
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await denyDevelopers();
  const sp = await searchParams;

  const filters = {
    status: sp.status || undefined,
    primary_owner_id: sp.primary_owner_id || undefined,
    company_id: sp.company_id || undefined,
    search: sp.search || undefined,
  };

  const [contacts, users, companies] = await Promise.all([
    listContacts(filters) as Promise<ContactRollup[]>,
    listActiveUsers(),
    listCompanies(),
  ]);

  const ids = contacts.map((c) => c.id);
  const [owners, leadSources] = await Promise.all([
    listOwnersForContacts(ids),
    listLeadSourcesForContacts(ids),
  ]);

  const companyNames: Record<string, string> = {};
  for (const co of companies) companyNames[co.id] = co.name;

  const ownerOptions = users.map((u) => ({
    id: u.id,
    label: u.full_name ?? u.email ?? u.id,
  }));
  const companyOptions = companies.map((co) => ({ id: co.id, label: co.name }));

  // Count line — computed from the data the viewer can actually see.
  const total = contacts.length;
  const activeClients = contacts.filter(
    (c) => c.status === 'active_client',
  ).length;
  const sub = `${total} ${total === 1 ? 'person' : 'people'} · ${activeClients} active ${
    activeClients === 1 ? 'client' : 'clients'
  }`;

  return (
    <AppShell title="Contacts">
      <div className="page-h">
        <div>
          <h1>Contacts</h1>
          <div className="sub">{sub}</div>
        </div>
        <div className="spacer" />
        <CreateContactDialog />
      </div>

      {/* AI strip returns in Phase 3, wired to ai_insights. Omitted now — no AI
          data yet, and we don't fake it. */}

      <ContactFilters owners={ownerOptions} companies={companyOptions} />

      {contacts.length === 0 ? (
        <div className="tbl-wrap">
          <div data-testid="contacts-empty" className="empty">
            <span
              className="ic"
              style={{ background: 'var(--color-accent-subtle)' }}
            >
              <Contact size={26} aria-hidden style={{ color: 'var(--color-accent)' }} />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              No contacts match these filters
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
                maxWidth: 340,
              }}
            >
              Try clearing a filter, or add the first person in this segment.
            </div>
          </div>
        </div>
      ) : (
        <ContactsTable
          contacts={contacts}
          owners={owners}
          leadSources={leadSources}
          companyNames={companyNames}
        />
      )}
    </AppShell>
  );
}
