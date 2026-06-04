'use client';

import { useState } from 'react';
import { Flag, SquareCheck, FlaskConical } from 'lucide-react';

// ProjectTabs — the cockpit's delivery tabs card (.tabs / .tab / .pane), ported
// from index.html / "Project (Developer view).html". Client-only tab switching
// over server-rendered pane content passed in as props, so the data stays
// RLS-gated on the server and only the active-pane toggle is client state.
//
// Tab set differs by projection (the page decides which panes to pass):
//   full      → Milestones / Tasks / Tests
//   developer → Milestones / My tasks / Tests
// (Conversation is its own card on the full cockpit, mirroring the approved
// Companies precedent.)

const ICONS = {
  milestones: Flag,
  tasks: SquareCheck,
  tests: FlaskConical,
} as const;

export type ProjectTab = {
  key: 'milestones' | 'tasks' | 'tests';
  label: string;
  count: number;
  content: React.ReactNode;
};

export function ProjectTabs({ tabs }: { tabs: ProjectTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? 'milestones');

  return (
    <div className="card">
      <div className="tabs">
        {tabs.map((t) => {
          const Icon = ICONS[t.key];
          return (
            <div
              key={t.key}
              className={`tab${active === t.key ? ' active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setActive(t.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActive(t.key);
                }
              }}
            >
              <Icon size={15} />
              {t.label} <span className="tc">{t.count}</span>
            </div>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.key} className={`pane${active === t.key ? ' active' : ''}`}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
