'use client';

import { Search, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { CONTACT_STATUSES, STATUS_LABEL } from '@/lib/ui';

type OwnerOption = { id: string; label: string };
type CompanyOption = { id: string; label: string };

// ContactFilters — ports the prototype's .filterbar: a .search-in pill + a row
// of .fdrop chips. Search / Status / Owner write the URL searchParams (the
// Server Component re-fetches via listContacts on navigation). Lead source &
// Rating are visual .fdrop chips only for now (not yet wired — they have no
// list-level filter behavior in Phase 1).
export function ContactFilters({
  owners,
  companies,
}: {
  owners: OwnerOption[];
  companies: CompanyOption[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  // Which .fdrop popover is open (status | owner | company), or null.
  const [open, setOpen] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`/contacts?${next.toString()}`);
    });
  }

  function onSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParam('search', value), 250);
  }

  const statusVal = params.get('status') ?? '';
  const ownerVal = params.get('primary_owner_id') ?? '';
  const companyVal = params.get('company_id') ?? '';

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
          placeholder="Search contacts…"
        />
      </div>

      {/* Status (wired) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="filter-status"
          className={`fdrop${statusVal ? ' on' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open === 'status'}
          onClick={() => setOpen(open === 'status' ? null : 'status')}
        >
          {statusVal ? STATUS_LABEL[statusVal] ?? statusVal : 'Status'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="status">
          <Opt
            selected={statusVal === ''}
            onClick={() => {
              setParam('status', '');
              setOpen(null);
            }}
          >
            All statuses
          </Opt>
          {CONTACT_STATUSES.map((s) => (
            <Opt
              key={s}
              selected={statusVal === s}
              onClick={() => {
                setParam('status', s);
                setOpen(null);
              }}
            >
              {STATUS_LABEL[s]}
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
          {ownerVal
            ? owners.find((o) => o.id === ownerVal)?.label ?? 'Owner'
            : 'Owner'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="owner">
          <Opt
            selected={ownerVal === ''}
            onClick={() => {
              setParam('primary_owner_id', '');
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
                setParam('primary_owner_id', o.id);
                setOpen(null);
              }}
            >
              {o.label}
            </Opt>
          ))}
        </Dropdown>
      </div>

      {/* Company (wired — kept from the data contract; testid filter-company) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="filter-company"
          className={`fdrop${companyVal ? ' on' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open === 'company'}
          onClick={() => setOpen(open === 'company' ? null : 'company')}
        >
          {companyVal
            ? companies.find((c) => c.id === companyVal)?.label ?? 'Company'
            : 'Company'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="company">
          <Opt
            selected={companyVal === ''}
            onClick={() => {
              setParam('company_id', '');
              setOpen(null);
            }}
          >
            All companies
          </Opt>
          {companies.map((c) => (
            <Opt
              key={c.id}
              selected={companyVal === c.id}
              onClick={() => {
                setParam('company_id', c.id);
                setOpen(null);
              }}
            >
              {c.label}
            </Opt>
          ))}
        </Dropdown>
      </div>

      {/* Lead source — visual only (not yet wired to a list filter). */}
      <button type="button" className="fdrop" disabled aria-disabled>
        Lead source
        <ChevronDown size={13} aria-hidden />
      </button>

      {/* Rating — visual only (not yet wired to a list filter). */}
      <button type="button" className="fdrop" disabled aria-disabled>
        Rating
        <ChevronDown size={13} aria-hidden />
      </button>

      {pending && (
        <span className="text-xs text-ink-tertiary">Updating…</span>
      )}
    </div>
  );
}
