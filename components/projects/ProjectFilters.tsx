'use client';

import { Search, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from '@/lib/ui-projects';

type MemberOption = { id: string; label: string };

// ProjectFilters — ports the approved Contacts .filterbar to projects: a
// .search-in pill + .fdrop chips. Search / Status / Member write the URL
// searchParams; the Server Component re-fetches via listProjects(filters) on
// navigation. Pure URL state — no client data fetch. Preserves the
// filter-search / filter-status / filter-member testids the smoke spec asserts.
export function ProjectFilters({ members }: { members: MemberOption[] }) {
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
      router.replace(`/projects?${next.toString()}`);
    });
  }

  function onSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParam('search', value), 250);
  }

  const statusVal = params.get('status') ?? '';
  const memberVal = params.get('member') ?? '';

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
          placeholder="Search name or ID…"
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
          {statusVal ? PROJECT_STATUS_LABEL[statusVal] ?? statusVal : 'Status'}
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
          {PROJECT_STATUSES.map((s) => (
            <Opt
              key={s}
              selected={statusVal === s}
              onClick={() => {
                setParam('status', s);
                setOpen(null);
              }}
            >
              {PROJECT_STATUS_LABEL[s]}
            </Opt>
          ))}
        </Dropdown>
      </div>

      {/* Member (wired — project_members join) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="filter-member"
          className={`fdrop${memberVal ? ' on' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open === 'member'}
          onClick={() => setOpen(open === 'member' ? null : 'member')}
        >
          {memberVal
            ? members.find((m) => m.id === memberVal)?.label ?? 'Member'
            : 'Member'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="member">
          <Opt
            selected={memberVal === ''}
            onClick={() => {
              setParam('member', '');
              setOpen(null);
            }}
          >
            All members
          </Opt>
          {members.map((m) => (
            <Opt
              key={m.id}
              selected={memberVal === m.id}
              onClick={() => {
                setParam('member', m.id);
                setOpen(null);
              }}
            >
              {m.label}
            </Opt>
          ))}
        </Dropdown>
      </div>

      {pending && <span className="text-xs text-ink-tertiary">Updating…</span>}
    </div>
  );
}
