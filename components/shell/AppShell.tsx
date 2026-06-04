import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';

// AppShell — the persistent frame, ported from the prototype:
//   .app (grid: sidebar + main) → .main (.topbar + .scroll > .sheet > children)
// Server Component; the small collapse + theme toggles are client islands.
// Page content is placed inside .sheet (max-width centered) — every screen
// reuses this shell, so its chrome is the single source of truth.
export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <TopBar title={title} />
        <div className="scroll">
          <div className="sheet">{children}</div>
        </div>
      </div>
    </div>
  );
}
