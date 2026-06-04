'use client';

import { useState, useTransition } from 'react';

import { updateProjectField } from '@/lib/actions/projects';

// ProjectDetailInlineField — the design-styled (.meta-row / .ie) field-level
// auto-save primitive for the Project Detail cockpit. Same contract as the
// approved contacts/companies inline fields:
//   - root carries data-testid="project-field-{field}"
//   - a field-status indicator carries data-testid="field-status"
//   - saves ONE allowlisted column via updateProjectField on blur (text/date) /
//     change (select). No submit button, no batched form.
// When `readOnly` (developer projection — RLS denies the write), the value renders
// as static text instead of an editable input, so a developer never sees a
// perpetual "Save failed".

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useFieldSave(projectId: string, field: string) {
  const [state, setState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function save(value: unknown) {
    setState('saving');
    startTransition(async () => {
      try {
        await updateProjectField(projectId, field, value);
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

// --- TEXT / DATE (saves on blur) -------------------------------------------
export function ProjectDetailInlineText({
  projectId,
  field,
  label,
  value,
  mono,
  type = 'text',
  readOnly = false,
}: {
  projectId: string;
  field: string;
  label: string;
  value: string | Date | null;
  mono?: boolean;
  type?: string;
  readOnly?: boolean;
}) {
  const { state, save } = useFieldSave(projectId, field);
  // The neon driver returns date/timestamptz columns as Date objects; coerce to a
  // YYYY-MM-DD string so they never render as a raw [object Date] React child.
  const sval =
    value == null
      ? ''
      : value instanceof Date
        ? value.toISOString().slice(0, 10)
        : type === 'date'
          ? String(value).slice(0, 10)
          : String(value);
  const [val, setVal] = useState(sval);

  if (readOnly) {
    return (
      <div className="meta-row" data-testid={`project-field-${field}`}>
        <span className="k">{label}</span>
        <span
          className={mono ? 'mono' : undefined}
          style={{
            fontSize: mono ? 13 : 14,
            color: 'var(--color-text-secondary)',
            fontFamily: mono ? 'var(--font-mono)' : undefined,
          }}
        >
          {sval !== '' ? sval : '—'}
        </span>
        <span data-testid="field-status" className="ie-saved" style={{ display: 'none' }} />
      </div>
    );
  }

  return (
    <div className="meta-row" data-testid={`project-field-${field}`}>
      <span className="k">{label}</span>
      <div className="ie" data-ie="text">
        <input
          type={type}
          value={val}
          aria-label={label}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            if (sval !== val) save(val === '' ? null : val);
          }}
          className={mono ? 'mono' : undefined}
          style={mono ? { fontFamily: 'var(--font-mono)', fontSize: 13 } : undefined}
        />
        <FieldStatus state={state} />
      </div>
    </div>
  );
}

// --- SELECT (saves on change) ----------------------------------------------
export function ProjectDetailInlineSelect({
  projectId,
  field,
  label,
  value,
  options,
  allowEmpty,
  readOnly = false,
}: {
  projectId: string;
  field: string;
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  readOnly?: boolean;
}) {
  const { state, save } = useFieldSave(projectId, field);
  const [val, setVal] = useState(value ?? '');

  if (readOnly) {
    const label2 = options.find((o) => o.value === value)?.label ?? '—';
    return (
      <div className="meta-row" data-testid={`project-field-${field}`}>
        <span className="k">{label}</span>
        <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          {label2}
        </span>
        <span data-testid="field-status" className="ie-saved" style={{ display: 'none' }} />
      </div>
    );
  }

  return (
    <div className="meta-row" data-testid={`project-field-${field}`}>
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
