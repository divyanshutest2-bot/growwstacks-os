'use client';

import { useState, useTransition } from 'react';

import { updateTaskField } from '@/lib/actions/tasks';

// DetailInlineField — the design-styled (.meta-row / .ie) field-level auto-save
// primitive for the Task Detail cockpit's left rail. Mirrors the Contacts
// cockpit's DetailInlineField exactly, but writes via updateTaskField:
//   - root carries data-testid="task-field-{field}"
//   - a field-status indicator carries data-testid="field-status"
//   - saves ONE allowlisted column on blur (text) / change (select).
// RLS gates the write (admin/pm always; a developer assignee on their own task).

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useFieldSave(taskId: string, field: string) {
  const [state, setState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function save(value: unknown) {
    setState('saving');
    startTransition(async () => {
      try {
        await updateTaskField(taskId, field, value);
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
  taskId,
  field,
  label,
  value,
  mono,
  type = 'text',
}: {
  taskId: string;
  field: string;
  label: string;
  value: string | null;
  mono?: boolean;
  type?: string;
}) {
  const { state, save } = useFieldSave(taskId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`task-field-${field}`}>
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
  taskId,
  field,
  label,
  value,
  options,
  allowEmpty,
}: {
  taskId: string;
  field: string;
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  const { state, save } = useFieldSave(taskId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`task-field-${field}`}>
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
