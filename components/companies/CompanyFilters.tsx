'use client';

import { Search, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { COMPANY_TYPES, COMPANY_TYPE_LABEL } from '@/lib/ui';

type OwnerOption = { id: string; label: string };

// CompanyFilters — ports Companies.html's .filterbar: a .search-in pill + a row
// of .fdrop chips. Search / Status (type) / Owner write the URL searchParams
// (the Server Component re-fetches via listCompanies on navigation). Industry,
// Rating and Active-projects are visual .fdrop chips only for now (no list-level
// filter wired in Phase 1 — companies have no rating column, and industry/active
// filters aren't yet in listCompanies). Mirrors the approved ContactFilters.
export function CompanyFilters({ owners }: { owners: OwnerOption[] }) {
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
      router.replace(`/companies?${next.toString()}`);
    });
  }

  function onSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParam('search', value), 250);
  }

  const typeVal = params.get('type') ?? '';
  const ownerVal = params.get('account_owner_id') ?? '';

  function Dropdown({ name, children }: { name: string; children: React.ReactNode }) {
    if (open !== name) return null;
    return (
      <div
        role="listbox"
        className="absolute z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border-subtle bg-surface p-1 shadow-md"
      >
        {children}
      </div>
    );
  }

  function Opt({
    selected,
    onClick,
    children,
  }: {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick}
        className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-hover ${
          selected ? 'text-accent-text' : 'text-ink'
        }`}
      >
        {children}
      </button>
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
          placeholder="Search companies…"
        />
      </div>

      {/* Status / type (wired) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="filter-type"
          className={`fdrop${typeVal ? ' on' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open === 'type'}
          onClick={() => setOpen(open === 'type' ? null : 'type')}
        >
          {typeVal ? COMPANY_TYPE_LABEL[typeVal] ?? typeVal : 'Status'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="type">
          <Opt
            selected={typeVal === ''}
            onClick={() => {
              setParam('type', '');
              setOpen(null);
            }}
          >
            All statuses
          </Opt>
          {COMPANY_TYPES.map((t) => (
            <Opt
              key={t}
              selected={typeVal === t}
              onClick={() => {
                setParam('type', t);
                setOpen(null);
              }}
            >
              {COMPANY_TYPE_LABEL[t]}
            </Opt>
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
          {ownerVal ? owners.find((o) => o.id === ownerVal)?.label ?? 'Owner' : 'Owner'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="owner">
          <Opt
            selected={ownerVal === ''}
            onClick={() => {
              setParam('account_owner_id', '');
              setOpen(null);
            }}
          >
            All owners
          </Opt>
          {owners.map((o) => (
            <Opt
              key={o.id}
              selected={ownerVal === o.id}
              onClick={() => {
                setParam('account_owner_id', o.id);
                setOpen(null);
              }}
            >
              {o.label}
            </Opt>
          ))}
        </Dropdown>
      </div>

      {/* Industry — visual only (not yet wired to a list filter). */}
      <button type="button" className="fdrop" disabled aria-disabled>
        Industry
        <ChevronDown size={13} aria-hidden />
      </button>

      {/* Rating — visual only (companies have no rating column). */}
      <button type="button" className="fdrop" disabled aria-disabled>
        Rating
        <ChevronDown size={13} aria-hidden />
      </button>

      {/* Active projects — visual only (not yet wired). */}
      <button type="button" className="fdrop" disabled aria-disabled>
        Active projects
        <ChevronDown size={13} aria-hidden />
      </button>

      {pending && <span className="text-xs text-ink-tertiary">Updating…</span>}
    </div>
  );
}
