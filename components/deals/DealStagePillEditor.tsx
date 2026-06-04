'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';

import { updateDealField } from '@/lib/actions/deals';
import { DEAL_STAGES, DEAL_STAGE_LABEL, DEAL_STAGE_DOT } from '@/lib/ui-deals';

// DealStagePillEditor — the header's clickable stage pill (.statuspill) with a
// popover (.menu) of the deal_stage values, each with its colored dot. Selecting
// one auto-saves via updateDealField(id,'stage',value). Mirrors contacts'
// StatusPillEditor. Carries the status-pill testid (stage IS the deal's status).
export function DealStagePillEditor({
  dealId,
  stage,
}: {
  dealId: string;
  stage: string;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(stage);
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
        await updateDealField(dealId, 'stage', next);
      } catch {
        setCurrent(prev);
      }
    });
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        className="statuspill"
        data-testid="status-pill"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span
          className="dot"
          style={{ background: DEAL_STAGE_DOT[current] ?? 'var(--color-text-muted)' }}
        />
        <span>{DEAL_STAGE_LABEL[current] ?? current}</span>
        <ChevronDown size={13} />
      </span>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0, maxHeight: 320, overflowY: 'auto' }}>
          {DEAL_STAGES.map((s) => (
            <button key={s} type="button" onClick={() => choose(s)}>
              <span
                className="dot"
                style={{ background: DEAL_STAGE_DOT[s] ?? 'var(--color-text-muted)' }}
              />
              {DEAL_STAGE_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
