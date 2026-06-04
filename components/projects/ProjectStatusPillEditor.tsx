'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';

import { updateProjectField } from '@/lib/actions/projects';
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from '@/lib/ui-projects';

// project_status → status-pill dot color var (tokens-only). Same map as the list.
const STATUS_DOT: Record<string, string> = {
  upcoming: 'var(--color-info-solid)',
  in_progress: 'var(--iris-500)',
  client_pending: 'var(--color-info-solid)',
  on_hold: 'var(--color-warning-solid)',
  payment_pending: 'var(--color-warning-solid)',
  handover: 'var(--color-warning-solid)',
  completed: 'var(--color-success-solid)',
  internal: 'var(--n-400)',
  lost: 'var(--color-danger-solid)',
};

// ProjectStatusPillEditor — the clickable .statuspill with a popover of the nine
// project_status values, each with its colored dot. Selecting one auto-saves via
// updateProjectField(id, 'status', value). RLS gates the write (admin/pm only);
// the pill reflects the optimistic value and reverts on error. The wrapper carries
// data-testid="status-pill" (the smoke spec asserts it on the detail).
export function ProjectStatusPillEditor({
  projectId,
  status,
  editable,
}: {
  projectId: string;
  status: string;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(status);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  function choose(next: string) {
    setOpen(false);
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    startTransition(async () => {
      try {
        await updateProjectField(projectId, 'status', next);
      } catch {
        setCurrent(prev);
      }
    });
  }

  const dot = (
    <span
      className="dot"
      style={{ background: STATUS_DOT[current] ?? 'var(--color-text-muted)' }}
    />
  );

  // Read-only path (developer): a plain .status pill, still tagged status-pill.
  if (!editable) {
    return (
      <span data-testid="status-pill" className="status">
        {dot}
        {PROJECT_STATUS_LABEL[current] ?? current}
      </span>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} data-testid="status-pill">
      <span
        className="statuspill"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {dot}
        <span>{PROJECT_STATUS_LABEL[current] ?? current}</span>
        <ChevronDown size={13} />
      </span>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0 }}>
          {PROJECT_STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => choose(s)}>
              <span
                className="dot"
                style={{ background: STATUS_DOT[s] ?? 'var(--color-text-muted)' }}
              />
              {PROJECT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
