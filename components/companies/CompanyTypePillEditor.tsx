'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';

import { updateCompanyField } from '@/lib/actions/companies';
import { COMPANY_TYPES, COMPANY_TYPE_LABEL, COMPANY_TYPE_DOT } from '@/lib/ui';

// CompanyTypePillEditor — the design's clickable status pill (.statuspill) bound
// to the company TYPE (prospect/client/partner/past_client), each with its
// colored dot. Selecting one auto-saves via updateCompanyField(id, 'type', value).
// Carries data-testid="status-pill" (the company spec maps type → status-pill).
// Mirrors the approved contacts StatusPillEditor.
export function CompanyTypePillEditor({
  companyId,
  type,
}: {
  companyId: string;
  type: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(type ?? 'prospect');
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
        await updateCompanyField(companyId, 'type', next);
      } catch {
        setCurrent(prev);
      }
    });
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} data-testid="field-status-type">
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
        <span
          className="dot"
          style={{ background: COMPANY_TYPE_DOT[current] ?? 'var(--color-text-muted)' }}
        />
        <span>{COMPANY_TYPE_LABEL[current] ?? current}</span>
        <ChevronDown size={13} />
      </span>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0 }}>
          {COMPANY_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => choose(t)}>
              <span
                className="dot"
                style={{ background: COMPANY_TYPE_DOT[t] ?? 'var(--color-text-muted)' }}
              />
              {COMPANY_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
