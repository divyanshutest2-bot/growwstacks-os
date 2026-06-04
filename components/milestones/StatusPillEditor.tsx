'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';

import { updateMilestoneField } from '@/lib/actions/milestones';
import {
  MILESTONE_STATUSES,
  MILESTONE_STATUS_LABEL,
  MILESTONE_STATUS_DOT,
} from '@/lib/ui-milestones';

// StatusPillEditor — the design's clickable status pill (.statuspill) with a
// popover (.menu) of the five milestone_status values, each with its colored dot.
// Selecting one auto-saves via updateMilestoneField(id, 'status', value). RLS gates
// the write (admin/pm only); the pill reflects the optimistic value and reverts on
// error. Carries the `status-pill` testid (shared contract). Mirrors Contacts.
export function StatusPillEditor({
  milestoneId,
  status,
  editable,
}: {
  milestoneId: string;
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
        await updateMilestoneField(milestoneId, 'status', next);
      } catch {
        setCurrent(prev);
      }
    });
  }

  const dot = (
    <span
      className="dot"
      style={{ background: MILESTONE_STATUS_DOT[current] ?? 'var(--color-text-muted)' }}
    />
  );
  const label = MILESTONE_STATUS_LABEL[current] ?? current;

  // Developer projection: status is read-only (no edit). Still tagged status-pill.
  if (!editable) {
    return (
      <span data-testid="status-pill" className="statuspill" style={{ cursor: 'default' }}>
        {dot}
        <span>{label}</span>
      </span>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        data-testid="status-pill"
        className="statuspill"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {dot}
        <span>{label}</span>
        <ChevronDown size={13} />
      </span>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0 }}>
          {MILESTONE_STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => choose(s)}>
              <span
                className="dot"
                style={{ background: MILESTONE_STATUS_DOT[s] ?? 'var(--color-text-muted)' }}
              />
              {MILESTONE_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
