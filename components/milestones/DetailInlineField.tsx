'use client';

import { useState, useTransition } from 'react';

import { updateMilestoneField } from '@/lib/actions/milestones';

// DetailInlineField — the design-styled (.meta-row / .ie) field-level auto-save
// primitives for the Milestone Detail cockpit. Same contract as the Contacts
// DetailInlineField:
//   - root carries data-testid="milestone-field-{field}"
//   - a field-status indicator carries data-testid="field-status"
//   - saves ONE allowlisted column via updateMilestoneField on blur (text/number/
//     date) or change (select). No submit button, no batched form.
// The <input>/<select> is always in the DOM, styled to read like the prototype's
// inline-edit affordance. RLS gates the write (admin/pm); these are only rendered
// for the full projection (developers get a read-only delivery panel).

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useFieldSave(milestoneId: string, field: string) {
  const [state, setState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function save(value: unknown) {
    setState('saving');
    startTransition(async () => {
      try {
        await updateMilestoneField(milestoneId, field, value);
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

function toDateInput(value: string | Date | null): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

// --- TEXT (saves on blur) ---------------------------------------------------
export function DetailInlineText({
  milestoneId,
  field,
  label,
  value,
  mono,
  placeholder,
}: {
  milestoneId: string;
  field: string;
  label: string;
  value: string | null;
  mono?: boolean;
  placeholder?: string;
}) {
  const { state, save } = useFieldSave(milestoneId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`milestone-field-${field}`}>
      <span className="k">{label}</span>
      <div className="ie" data-ie="text">
        <input
          type="text"
          value={val}
          aria-label={label}
          placeholder={placeholder}
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

// --- NUMBER (saves on blur; emits a number or null) -------------------------
export function DetailInlineNumber({
  milestoneId,
  field,
  label,
  value,
  placeholder,
}: {
  milestoneId: string;
  field: string;
  label: string;
  value: string | number | null;
  placeholder?: string;
}) {
  const { state, save } = useFieldSave(milestoneId, field);
  const initial = value === null || value === undefined ? '' : String(value);
  const [val, setVal] = useState(initial);

  return (
    <div className="meta-row" data-testid={`milestone-field-${field}`}>
      <span className="k">{label}</span>
      <div className="ie" data-ie="text">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={val}
          aria-label={label}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            if (initial !== val) save(val === '' ? null : Number(val));
          }}
          className="mono"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}
        />
        <FieldStatus state={state} />
      </div>
    </div>
  );
}

// --- DATE (saves on change; emits YYYY-MM-DD or null) -----------------------
// Date-safe: the neon driver returns date columns as Date objects, not strings.
export function DetailInlineDate({
  milestoneId,
  field,
  label,
  value,
}: {
  milestoneId: string;
  field: string;
  label: string;
  value: string | Date | null;
}) {
  const { state, save } = useFieldSave(milestoneId, field);
  const initial = toDateInput(value);
  const [val, setVal] = useState(initial);

  return (
    <div className="meta-row" data-testid={`milestone-field-${field}`}>
      <span className="k">{label}</span>
      <div className="ie" data-ie="text">
        <input
          type="date"
          value={val}
          aria-label={label}
          onChange={(e) => {
            const next = e.target.value;
            setVal(next);
            save(next === '' ? null : next);
          }}
          className="mono"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
        />
        <FieldStatus state={state} />
      </div>
    </div>
  );
}

// --- SELECT (saves on change) -----------------------------------------------
export function DetailInlineSelect({
  milestoneId,
  field,
  label,
  value,
  options,
  allowEmpty,
}: {
  milestoneId: string;
  field: string;
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  const { state, save } = useFieldSave(milestoneId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`milestone-field-${field}`}>
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
