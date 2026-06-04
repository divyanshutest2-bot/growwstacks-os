'use client';

import { useState, useTransition } from 'react';

import { updateUserField } from '@/lib/actions/users';

// UserDetailInlineField — the design-styled (.meta-row / .ie) field-level
// auto-save primitive for the User Detail cockpit. Same contract as the approved
// contacts/projects inline fields:
//   - root carries data-testid="user-field-{field}"
//   - a field-status indicator carries data-testid="field-status"
//   - saves ONE self-editable column via updateUserField on blur (text/time).
// RLS gates the ROW (admin OR own row); the EDITABLE_FIELDS allowlist gates the
// column. role/status are NOT here — they are admin-only (RoleStatusEditor).
//
// DATE/TIME SAFETY: the neon driver returns `time` columns (shift_start/_end) as
// 'HH:MM:SS' strings, but we coerce defensively so a Date object would never
// render as a raw React child.

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useFieldSave(userId: string, field: string) {
  const [state, setState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function save(value: unknown) {
    setState('saving');
    startTransition(async () => {
      try {
        await updateUserField(userId, field, value);
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

// Coerce a value that may arrive as a Date object (defensive), a 'HH:MM:SS'
// time string, or a plain string into the string the input should display.
function coerce(value: string | Date | null | undefined, type: string): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return type === 'time'
      ? value.toISOString().slice(11, 16)
      : value.toISOString().slice(0, 10);
  }
  const s = String(value);
  // 'HH:MM:SS' → 'HH:MM' for the time input.
  if (type === 'time') {
    const m = /^(\d{2}:\d{2})/.exec(s);
    return m ? m[1] : s;
  }
  return s;
}

// --- TEXT / TIME (saves on blur) -------------------------------------------
export function UserDetailInlineText({
  userId,
  field,
  label,
  value,
  mono,
  type = 'text',
}: {
  userId: string;
  field: string;
  label: string;
  value: string | Date | null;
  mono?: boolean;
  type?: string;
}) {
  const { state, save } = useFieldSave(userId, field);
  const sval = coerce(value, type);
  const [val, setVal] = useState(sval);

  return (
    <div className="meta-row" data-testid={`user-field-${field}`}>
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
