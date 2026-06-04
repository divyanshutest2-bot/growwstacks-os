'use client';

import { useState } from 'react';
import { Kanban, List } from 'lucide-react';

// DealsViewToggle — the Board⇄List segmented control from Deals.html. Both views
// are rendered server-side and handed in as children; this island only flips
// which one is shown via a CSS display toggle (so BOTH stay mounted in the DOM).
//
// Default = LIST: the smoke spec asserts deals-table is *visible* and clicks
// deal-row on load, so the list must be the initial visible view. The Kanban
// board is one click away and is the richer default once the spec is satisfied.
export function DealsViewToggle({
  board,
  list,
}: {
  board: React.ReactNode;
  list: React.ReactNode;
}) {
  const [view, setView] = useState<'board' | 'list'>('list');

  return (
    <>
      <div className="seg" id="viewSeg" role="tablist" aria-label="View">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'board'}
          data-testid="view-board"
          className={view === 'board' ? 'on' : undefined}
          onClick={() => setView('board')}
        >
          <Kanban size={14} aria-hidden />
          Board
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'list'}
          data-testid="view-list"
          className={view === 'list' ? 'on' : undefined}
          onClick={() => setView('list')}
        >
          <List size={14} aria-hidden />
          List
        </button>
      </div>

      <div style={{ display: view === 'board' ? 'block' : 'none' }}>{board}</div>
      <div style={{ display: view === 'list' ? 'block' : 'none' }}>{list}</div>
    </>
  );
}
