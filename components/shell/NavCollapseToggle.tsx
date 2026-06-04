'use client';

import { PanelLeft } from 'lucide-react';
import { useCallback } from 'react';

// NavCollapseToggle — the topbar button that collapses the sidebar rail.
// Mirrors the prototype's #navToggle: toggles `.collapsed` on the `.app` root,
// which the design CSS uses to shrink --nav-w (232px → 64px). DOM-driven so the
// AppShell can stay a Server Component (no client state needed for the frame).
export function NavCollapseToggle() {
  const toggle = useCallback(() => {
    document.querySelector('.app')?.classList.toggle('collapsed');
  }, []);

  return (
    <button
      type="button"
      className="icon-btn"
      title="Collapse nav"
      aria-label="Collapse navigation"
      onClick={toggle}
    >
      <PanelLeft size={18} aria-hidden />
    </button>
  );
}
