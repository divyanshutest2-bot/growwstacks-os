'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Search } from 'lucide-react';

import { MILESTONE_STATUSES, MILESTONE_STATUS_LABEL } from '@/lib/ui-milestones';

type ProjectOption = { id: string; label: string };

// MilestoneFilters — the design's .filterbar: a search-in box + native selects
// styled as .fdrop. Updates URL searchParams; the Server Component re-fetches via
// listMilestones(filters) on navigation. Pure URL state, no client data fetch.
export function MilestoneFilters({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`/milestones?${next.toString()}`);
    });
  }

  const dropStyle: React.CSSProperties = {
    appearance: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div className="filterbar">
      <div className="search-in">
        <Search size={15} style={{ color: 'var(--color-text-muted)' }} />
        <input
          data-testid="filter-search"
          type="search"
          defaultValue={params.get('search') ?? ''}
          onChange={(e) => setParam('search', e.target.value)}
          placeholder="Search milestones…"
        />
      </div>

      <select
        data-testid="filter-project"
        className="fdrop"
        style={dropStyle}
        value={params.get('project_id') ?? ''}
        onChange={(e) => setParam('project_id', e.target.value)}
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>

      <select
        data-testid="filter-status"
        className="fdrop"
        style={dropStyle}
        value={params.get('status') ?? ''}
        onChange={(e) => setParam('status', e.target.value)}
      >
        <option value="">All statuses</option>
        {MILESTONE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {MILESTONE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      {pending && (
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Updating…
        </span>
      )}
    </div>
  );
}
