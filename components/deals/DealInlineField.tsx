'use client';

import { useState, useTransition } from 'react';

import { updateDealField } from '@/lib/actions/deals';

// DealInlineField — the design-styled (.meta-row / .ie) field-level auto-save
// primitive for the Deal Detail cockpit. Mirrors contacts' DetailInlineField:
//   - root carries data-testid="deal-field-{field}"
//   - a field-status indicator carries data-testid="field-status"
//   - saves ONE allowlisted column via updateDealField on blur (text) /
//     change (select). The <input>/<select> is always in the DOM.
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useFieldSave(dealId: string, field: string) {
  const [state, setState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function save(value: unknown) {
    setState('saving');
    startTransition(async () => {
      try {
        await updateDealField(dealId, field, value);
        setState('saved');
      } catch {
        setState('error');
      }
    });
  }
  return { state, save };
}

function FieldStatus({ state }: { state: SaveState }) {
  if (state === 'idle') {
    return <span data-testid="field-status" className="ie-saved" style={{ opacity: 0 }} />;
  }
  if (state === 'saving') {
    return (
      <span data-testid="field-status" className="ie-saving">
        Saving…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span data-testid="field-status" className="ie-saved">
        Saved
      </span>
    );
  }
  return (
    <span
      data-testid="field-status"
      className="ie-saving"
      style={{ color: 'var(--color-danger-text)' }}
    >
      Save failed
    </span>
  );
}

// --- TEXT (saves on blur) ---------------------------------------------------
export function DealInlineText({
  dealId,
  field,
  label,
  value,
  mono,
  type = 'text',
  numeric = false,
}: {
  dealId: string;
  field: string;
  label: string;
  value: string | null;
  mono?: boolean;
  type?: string;
  numeric?: boolean;
}) {
  const { state, save } = useFieldSave(dealId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`deal-field-${field}`}>
      <span className="k">{label}</span>
      <div className="ie" data-ie="text">
        <input
          type={type}
          value={val}
          aria-label={label}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            if ((value ?? '') !== val) {
              const next = val === '' ? null : val;
              save(numeric && next !== null ? Number(next) : next);
            }
          }}
          className={mono ? 'mono' : undefined}
          style={mono ? { fontFamily: 'var(--font-mono)', fontSize: 13 } : undefined}
        />
        <FieldStatus state={state} />
      </div>
    </div>
  );
}

// --- SELECT (saves on change) -----------------------------------------------
export function DealInlineSelect({
  dealId,
  field,
  label,
  value,
  options,
  allowEmpty,
}: {
  dealId: string;
  field: string;
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  const { state, save } = useFieldSave(dealId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`deal-field-${field}`}>
      <span className="k">{label}</span>
      <div className="ie" data-ie="select">
        <select
          value={val}
          aria-label={label}
          onChange={(e) => {
            const next = e.target.value;
            setVal(next);
            save(next === '' ? null : next);
          }}
          style={{
            border: 0,
            outline: 0,
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: 14,
            color: 'var(--color-text-primary)',
            width: '100%',
          }}
        >
          {allowEmpty && <option value="">—</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <FieldStatus state={state} />
      </div>
    </div>
  );
}
