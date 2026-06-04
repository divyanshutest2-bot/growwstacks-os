'use client';

import { Search, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { TASK_STATUSES, TASK_STATUS_LABEL } from '@/lib/ui-tasks';

type Option = { id: string; label: string };

// TaskFilters — ports Tasks.html's .filterbar: a .search-in pill + a row of
// .fdrop chips (Milestone / Status / Priority / Assignee). Search / Status /
// Milestone / Assignee write the URL searchParams (the Server Component re-fetches
// via listTasks on navigation). Priority is a visual .fdrop chip only for now
// (no list-level priority filter in listTasks).
export function TaskFilters({
  assignees,
  milestones,
}: {
  assignees: Option[];
  milestones: Option[];
}) {
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
      router.replace(`/tasks?${next.toString()}`);
    });
  }

  function onSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParam('search', value), 250);
  }

  const statusVal = params.get('status') ?? '';
  const assigneeVal = params.get('assignee') ?? '';
  const milestoneVal = params.get('milestone') ?? '';

  function Dropdown({ name, children }: { name: string; children: React.ReactNode }) {
    if (open !== name) return null;
    return (
      <div
        role="listbox"
        className="menu"
        style={{ top: 'calc(100% + 6px)', left: 0, maxHeight: 256, overflowY: 'auto', minWidth: 220 }}
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
        style={{ color: selected ? 'var(--color-accent-text)' : 'var(--color-text-primary)' }}
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
          placeholder="Search tasks…"
        />
      </div>

      {/* Milestone (wired) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="filter-milestone"
          className={`fdrop${milestoneVal ? ' on' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open === 'milestone'}
          onClick={() => setOpen(open === 'milestone' ? null : 'milestone')}
        >
          {milestoneVal
            ? milestones.find((m) => m.id === milestoneVal)?.label ?? 'Milestone'
            : 'Milestone'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="milestone">
          <Opt
            selected={milestoneVal === ''}
            onClick={() => {
              setParam('milestone', '');
              setOpen(null);
            }}
          >
            All milestones
          </Opt>
          {milestones.map((m) => (
            <Opt
              key={m.id}
              selected={milestoneVal === m.id}
              onClick={() => {
                setParam('milestone', m.id);
                setOpen(null);
              }}
            >
              {m.label}
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
          {statusVal ? TASK_STATUS_LABEL[statusVal] ?? statusVal : 'Status'}
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
          {TASK_STATUSES.map((s) => (
            <Opt
              key={s}
              selected={statusVal === s}
              onClick={() => {
                setParam('status', s);
                setOpen(null);
              }}
            >
              {TASK_STATUS_LABEL[s]}
            </Opt>
          ))}
        </Dropdown>
      </div>

      {/* Priority — visual only (not yet wired to a list filter). */}
      <button type="button" className="fdrop" disabled aria-disabled>
        Priority
        <ChevronDown size={13} aria-hidden />
      </button>

      {/* Assignee (wired) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="filter-assignee"
          className={`fdrop${assigneeVal ? ' on' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open === 'assignee'}
          onClick={() => setOpen(open === 'assignee' ? null : 'assignee')}
        >
          {assigneeVal
            ? assignees.find((a) => a.id === assigneeVal)?.label ?? 'Assignee'
            : 'Assignee'}
          <ChevronDown size={13} aria-hidden />
        </button>
        <Dropdown name="assignee">
          <Opt
            selected={assigneeVal === ''}
            onClick={() => {
              setParam('assignee', '');
              setOpen(null);
            }}
          >
            All assignees
          </Opt>
          {assignees.map((a) => (
            <Opt
              key={a.id}
              selected={assigneeVal === a.id}
              onClick={() => {
                setParam('assignee', a.id);
                setOpen(null);
              }}
            >
              {a.label}
            </Opt>
          ))}
        </Dropdown>
      </div>

      {pending && <span className="text-xs text-ink-tertiary">Updating…</span>}
    </div>
  );
}
