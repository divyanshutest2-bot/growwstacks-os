import { Search, Bell } from 'lucide-react';

import { NavCollapseToggle } from '@/components/shell/NavCollapseToggle';
import { ThemeToggle } from '@/components/shell/ThemeToggle';

// TopBar — collapse toggle · breadcrumb (page title = .here) · spacer ·
// search pill · theme toggle · bell. Ported from the prototype's .topbar.
export function TopBar({ title }: { title: string }) {
  return (
    <div className="topbar">
      <NavCollapseToggle />
      <nav className="crumb">
        <span className="here">{title}</span>
      </nav>
      <div className="spacer" />
      <div className="search">
        <Search size={15} aria-hidden />
        Search…
      </div>
      <ThemeToggle />
      <button type="button" className="icon-btn" aria-label="Notifications">
        <Bell size={18} aria-hidden />
      </button>
    </div>
  );
}
