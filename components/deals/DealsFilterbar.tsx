'use client';

import { Search, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { DEAL_STAGES, DEAL_STAGE_LABEL } from '@/lib/ui-deals';

type OwnerOption = { id: string; label: string };

// DealsFilterbar — ports Deals.html's .filterbar onto the shared shell chrome
// (.search-in pill + .fdrop chips), mirroring ContactFilters. Search / Stage /
// Owner write URL searchParams; the Server Component re-fetches via listDeals on
// navigation. Preserves filter-search / filter-stage / filter-owner testids.
export function DealsFilterbar({ owners }: { owners: OwnerOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`/deals?${next.toString()}`);
    });
  }

  function onSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParam('search', value), 250);
  }

  const stageVal = params.get('stage') ?? '';
  const ownerVal = params.get('owner') ?? '';

  function Dropdown({
    name,
    children,
  }: {
    name: string;
    children: React.ReactNode;
  }) {
    if (open !== name) return null;
    return (
      <div
        role="listbox"
        className="menu"
        style={{ top: 'calc(100% + 6px)', left: 0, maxHeight: 280, overflowY: 'auto' }}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="filterbar" id="filterbar">
      <div className="search-in">
        <Search size={15} aria-hidden style={{ color: 'var(--color-text-muted)' }} />
        <input
          data-testid="filter-search"
          defaultValue={params.get('search') ?? ''}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search deals…"
        />
      </div>

      {/* Stage (wired) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="filter-stage"
          className={`fdrop${stageVal ? ' on' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open === 'stage'}
          onClick={() => setOpen(open === 'stage' ? null : 'stage')}
        >
          {stageVal ? DEAL_STAGE_LABEL[stageVal] ?? stageVal : 'Stage'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="stage">
          <button
            type="button"
            onClick={() => {
              setParam('stage', '');
              setOpen(null);
            }}
          >
            All stages
          </button>
          {DEAL_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setParam('stage', s);
                setOpen(null);
              }}
            >
              {DEAL_STAGE_LABEL[s] ?? s}
            </button>
          ))}
        </Dropdown>
      </div>

      {/* Owner (wired) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="filter-owner"
          className={`fdrop${ownerVal ? ' on' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open === 'owner'}
          onClick={() => setOpen(open === 'owner' ? null : 'owner')}
        >
          {ownerVal
            ? owners.find((o) => o.id === ownerVal)?.label ?? 'Owner'
            : 'Owner'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="owner">
          <button
            type="button"
            onClick={() => {
              setParam('owner', '');
              setOpen(null);
            }}
          >
            All owners
          </button>
          {owners.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setParam('owner', o.id);
                setOpen(null);
              }}
            >
              {o.label}
            </button>
          ))}
        </Dropdown>
      </div>

      {/* Value range — visual only (not yet wired to a list filter). */}
      <button type="button" className="fdrop" disabled aria-disabled>
        Value range
        <ChevronDown size={13} aria-hidden />
      </button>

      {/* Expected close — visual only (not yet wired to a list filter). */}
      <button type="button" className="fdrop" disabled aria-disabled>
        Expected close
        <ChevronDown size={13} aria-hidden />
      </button>

      {pending && <span className="text-xs text-ink-tertiary">Updating…</span>}
    </div>
  );
}
