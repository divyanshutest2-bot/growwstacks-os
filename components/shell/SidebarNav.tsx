'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Building2,
  Contact,
  Handshake,
  Kanban,
  Flag,
  Receipt,
  SquareCheck,
  Sparkles,
  UserCog,
  Cable,
  type LucideIcon,
} from 'lucide-react';

// SidebarNav — the nav-item list. Client so it can derive `.active` from the
// current pathname (mirrors the prototype's data-active). Role drives WHICH set
// renders: developers get the walled-down DEV set (no companies/contacts/deals/
// payments/users — mirrors the data wall); everyone else gets the FULL set.

type Item = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: string;
  // iconColor lets the AI "Attention" item glow iris like the prototype.
  iconColor?: string;
};

const FULL: Item[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, href: '/' },
  { key: 'companies', label: 'Companies', icon: Building2, href: '/companies' },
  { key: 'contacts', label: 'Contacts', icon: Contact, href: '/contacts' },
  { key: 'deals', label: 'Deals', icon: Handshake, href: '/deals' },
  { key: 'projects', label: 'Projects', icon: Kanban, href: '/projects' },
  { key: 'milestones', label: 'Milestones', icon: Flag, href: '/milestones' },
  { key: 'payments', label: 'Payments', icon: Receipt, href: '/payments' },
  { key: 'tasks', label: 'Tasks', icon: SquareCheck, href: '/tasks' },
];

const DEV: Item[] = [
  { key: 'dashboard', label: 'My work', icon: LayoutGrid, href: '/' },
  { key: 'projects', label: 'Projects', icon: Kanban, href: '/projects' },
  { key: 'milestones', label: 'Milestones', icon: Flag, href: '/milestones' },
  { key: 'tasks', label: 'My tasks', icon: SquareCheck, href: '/tasks', badge: '6' },
];

const ADMIN: Item[] = [
  { key: 'users', label: 'Users', icon: UserCog, href: '/users' },
  { key: 'integrations', label: 'Integrations', icon: Cable, href: '/integrations' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`ni${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={17} aria-hidden style={item.iconColor ? { color: item.iconColor } : undefined} />
      <span className="ni-label">{item.label}</span>
      {item.badge ? <span className="ni-badge">{item.badge}</span> : null}
    </Link>
  );
}

export function SidebarNav({ role }: { role: string | null }) {
  const pathname = usePathname();
  const dev = role === 'developer';
  const items = dev ? DEV : FULL;

  return (
    <>
      {items.map((it) => (
        <NavLink key={it.key} item={it} active={isActive(pathname, it.href)} />
      ))}

      <div className="nh">AI Supervisor</div>
      <Link href="/" className="ni">
        <Sparkles size={17} aria-hidden style={{ color: 'var(--iris-300)' }} />
        <span className="ni-label">{dev ? 'My attention' : 'Attention'}</span>
        <span className="ni-badge">{dev ? '3' : '7'}</span>
      </Link>

      {!dev && (
        <>
          <div className="nh">Admin</div>
          {ADMIN.map((it) => (
            <NavLink key={it.key} item={it} active={isActive(pathname, it.href)} />
          ))}
        </>
      )}
    </>
  );
}
