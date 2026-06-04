'use client';

import { useState, useTransition } from 'react';

import { updateContactField } from '@/lib/actions/contacts';

// DetailInlineField — the design-styled (.meta-row / .ie) field-level auto-save
// primitive for the Contact Detail cockpit. Same contract as InlineField:
//   - root carries data-testid="contact-field-{field}"
//   - a field-status indicator carries data-testid="field-status"
//   - saves ONE allowlisted column via updateContactField on blur (text) /
//     change (select). No submit button, no batched form.
// The <input>/<select> is always present in the DOM (the Playwright test fills it
// directly), styled to read like the prototype's inline-edit affordance.

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useFieldSave(contactId: string, field: string) {
  const [state, setState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function save(value: unknown) {
    setState('saving');
    startTransition(async () => {
      try {
        await updateContactField(contactId, field, value);
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
export function DetailInlineText({
  contactId,
  field,
  label,
  value,
  mono,
  type = 'text',
}: {
  contactId: string;
  field: string;
  label: string;
  value: string | null;
  mono?: boolean;
  type?: string;
}) {
  const { state, save } = useFieldSave(contactId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`contact-field-${field}`}>
      <span className="k">{label}</span>
      <div className="ie" data-ie="text">
        <input
          type={type}
          value={val}
          aria-label={label}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            if ((value ?? '') !== val) save(val === '' ? null : val);
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
export function DetailInlineSelect({
  contactId,
  field,
  label,
  value,
  options,
  allowEmpty,
}: {
  contactId: string;
  field: string;
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  const { state, save } = useFieldSave(contactId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`contact-field-${field}`}>
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
