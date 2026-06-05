import { Layers, LogOut } from 'lucide-react';

import { SidebarNav } from '@/components/shell/SidebarNav';
import { getCurrentUserRole } from '@/lib/auth';
import { getCurrentUser } from '@/lib/actions/directory';
import { initials, avatarBg } from '@/lib/ui';

// Sidebar — the dark rail. Server Component: resolves the viewer's role (to
// gate the nav) and their own user row (for the account chip). The nav items
// themselves live in SidebarNav (client) so the active item tracks the route.

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  pm: 'Project Manager',
  sales: 'Sales',
  finance: 'Finance',
  developer: 'Developer',
};

export async function Sidebar() {
  const [role, me] = await Promise.all([
    getCurrentUserRole(),
    getCurrentUser(),
  ]);

  const name = me?.full_name ?? me?.email ?? 'Signed in';
  const roleLabel = (role && ROLE_LABEL[role]) ?? role ?? '—';
  const init = initials(me?.full_name ?? me?.email ?? null);
  const bg = avatarBg(me?.id ?? name);

  return (
    <aside className="sidebar">
      <div className="brandrow">
        <span className="brandmark">
          <Layers size={17} className="ic-fill" aria-hidden />
        </span>
        <span className="brandname">
          GrowwStacks<span> OS</span>
        </span>
      </div>

      <SidebarNav role={role} />

      <div className="acct">
        <div className="acct-row">
          <span
            className="avatar"
            style={{ background: bg, boxShadow: 'none', width: 26, height: 26 }}
          >
            {init}
          </span>
          <div className="acct-meta">
            <div className="n">{name}</div>
            <div className="r">{roleLabel}</div>
          </div>
          <form action="/api/logout" method="post">
            <button type="submit" className="acct-logout" aria-label="Log out" title="Log out">
              <LogOut size={14} aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
