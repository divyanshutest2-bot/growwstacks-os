'use client';

import { Search, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import {
  USER_ROLES,
  USER_STATUSES,
  ROLE_LABEL,
  USER_STATUS_LABEL,
} from '@/lib/ui-users';

// UserFilters — ports the prototype's .filterbar: a .search-in pill + a row of
// .fdrop chips (Role / Status / Tech). Search / Role / Status write the URL
// searchParams (the Server Component re-fetches via listUsers on navigation).
// Tech is a visual .fdrop chip only for now (no list-level filter behavior yet).
export function UserFilters() {
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
      router.replace(`/users?${next.toString()}`);
    });
  }

  function onSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParam('search', value), 250);
  }

  const roleVal = params.get('role') ?? '';
  const statusVal = params.get('status') ?? '';

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
          placeholder="Search people…"
        />
      </div>

      {/* Role (wired) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="filter-role"
          className={`fdrop${roleVal ? ' on' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open === 'role'}
          onClick={() => setOpen(open === 'role' ? null : 'role')}
        >
          {roleVal ? ROLE_LABEL[roleVal] ?? roleVal : 'Role'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="role">
          <Opt
            selected={roleVal === ''}
            onClick={() => {
              setParam('role', '');
              setOpen(null);
            }}
          >
            All roles
          </Opt>
          {USER_ROLES.map((r) => (
            <Opt
              key={r}
              selected={roleVal === r}
              onClick={() => {
                setParam('role', r);
                setOpen(null);
              }}
            >
              {ROLE_LABEL[r]}
            </Opt>
          ))}
        </Dropdown>
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
          {statusVal ? USER_STATUS_LABEL[statusVal] ?? statusVal : 'Status'}
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
          {USER_STATUSES.map((s) => (
            <Opt
              key={s}
              selected={statusVal === s}
              onClick={() => {
                setParam('status', s);
                setOpen(null);
              }}
            >
              {USER_STATUS_LABEL[s]}
            </Opt>
          ))}
        </Dropdown>
      </div>

      {/* Tech — visual only (not yet wired to a list filter). */}
      <button type="button" className="fdrop" disabled aria-disabled>
        Tech
        <ChevronDown size={13} aria-hidden />
      </button>

      {pending && <span className="text-xs text-ink-tertiary">Updating…</span>}
    </div>
  );
}
