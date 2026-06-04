import { Users as UsersIcon } from 'lucide-react';

import '@/app/contact-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { UserFilters } from '@/components/users/UserFilters';
import { UsersTable } from '@/components/users/UsersTable';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { listUsers } from '@/lib/actions/users';
import { getCurrentUserRole } from '@/lib/auth';
import type { UserRollup } from '@/lib/types-users';

export const dynamic = 'force-dynamic';

type SearchParams = {
  role?: string;
  status?: string;
  search?: string;
};

// /users — team directory list. Server Component. EVERY role reads the full
// directory (users_select USING(true) — no dev-wall). Only an admin sees the
// "Invite user" provisioning button (createUser is RLS-gated to admin regardless).
// Ports Users.html into the .sheet/.page-h/.filterbar/.tbl chrome.
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const filters = {
    role: sp.role || undefined,
    status: sp.status || undefined,
    search: sp.search || undefined,
  };

  const [users, role] = await Promise.all([
    listUsers(filters) as Promise<UserRollup[]>,
    getCurrentUserRole(),
  ]);

  const isAdmin = role === 'admin';

  // Count line — computed from the rows the viewer can actually see.
  const total = users.length;
  const active = users.filter((u) => u.status === 'active').length;
  const sub = `${total} ${total === 1 ? 'team member' : 'team members'} · ${active} active`;

  return (
    <AppShell title="Users">
      <div className="page-h">
        <div>
          <h1>Users</h1>
          <div className="sub">{sub}</div>
        </div>
        <div className="spacer" />
        {isAdmin && <CreateUserDialog />}
      </div>

      {/* AI strip returns when wired to ai_insights — omitted now (no AI data yet;
          we don't fake it, mirroring the approved Contacts list). */}

      <UserFilters />

      {users.length === 0 ? (
        <div className="tbl-wrap">
          <div data-testid="users-empty" className="empty">
            <span className="ic" style={{ background: 'var(--color-accent-subtle)' }}>
              <UsersIcon size={26} aria-hidden style={{ color: 'var(--color-accent)' }} />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              No team members match these filters
            </div>
            <div
              style={{ fontSize: 13, color: 'var(--color-text-tertiary)', maxWidth: 340 }}
            >
              Try clearing a filter, or invite a new team member.
            </div>
          </div>
        </div>
      ) : (
        <UsersTable users={users} />
      )}
    </AppShell>
  );
}
