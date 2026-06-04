'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';

import { updateContactField } from '@/lib/actions/contacts';
import { CONTACT_STATUSES, STATUS_LABEL, STATUS_DOT } from '@/lib/ui';

// StatusPillEditor — the design's clickable status pill (.statuspill) with a
// popover (.menu) of the five contact_status values, each with its colored dot.
// Selecting one auto-saves via updateContactField(id, 'status', value). RLS gates
// the write; the pill reflects the optimistic value and reverts on error.
export function StatusPillEditor({
  contactId,
  status,
}: {
  contactId: string;
  status: string;
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
        await updateContactField(contactId, 'status', next);
      } catch {
        setCurrent(prev);
      }
    });
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        className="statuspill"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span
          className="dot"
          style={{ background: STATUS_DOT[current] ?? 'var(--color-text-muted)' }}
        />
        <span>{STATUS_LABEL[current] ?? current}</span>
        <ChevronDown size={13} />
      </span>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0 }}>
          {CONTACT_STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => choose(s)}>
              <span
                className="dot"
                style={{ background: STATUS_DOT[s] ?? 'var(--color-text-muted)' }}
              />
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
