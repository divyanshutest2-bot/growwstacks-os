'use client';

import { useState, useTransition } from 'react';

import { updateContactField } from '@/lib/actions/contacts';

// InlineField — the FIELD-LEVEL AUTO-SAVE primitive. One editable field, saved
// on blur (text/textarea) or change (select/toggle) via updateContactField(id,
// field, value). NO submit button, NO batched edit form. Each instance owns its
// own saving/saved/error state, surfaced via the `field-status` testid.
//
// The server action is single-column + allowlisted + RLS-gated; this component
// is purely the interaction + optimistic-ish status indicator.

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type BaseProps = {
  contactId: string;
  field: string;
  label: string;
};

function FieldStatus({ state }: { state: SaveState }) {
  if (state === 'idle') {
    return <span data-testid="field-status" className="text-xs text-ink-tertiary" />;
  }
  const map: Record<Exclude<SaveState, 'idle'>, { cls: string; text: string }> = {
    saving: { cls: 'text-ink-tertiary', text: 'Saving…' },
    saved: { cls: 'text-success-text', text: 'Saved' },
    error: { cls: 'text-danger-text', text: 'Save failed' },
  };
  const { cls, text } = map[state];
  return (
    <span data-testid="field-status" className={`text-xs ${cls}`}>
      {text}
    </span>
  );
}

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

const INPUT_CLS =
  'w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast placeholder:text-ink-tertiary focus:border-border-focus focus:shadow-focus';

function FieldShell({
  field,
  label,
  state,
  children,
}: BaseProps & { state: SaveState; children: React.ReactNode }) {
  return (
    <div data-testid={`contact-field-${field}`} className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          {label}
        </span>
        <FieldStatus state={state} />
      </div>
      {children}
    </div>
  );
}

// --- TEXT (saves on blur) ---------------------------------------------------
export function InlineText({
  contactId,
  field,
  label,
  value,
  placeholder,
  type = 'text',
}: BaseProps & { value: string | null; placeholder?: string; type?: string }) {
  const { state, save } = useFieldSave(contactId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <FieldShell contactId={contactId} field={field} label={label} state={state}>
      <input
        type={type}
        value={val}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if ((value ?? '') !== val) save(val === '' ? null : val);
        }}
        className={INPUT_CLS}
      />
    </FieldShell>
  );
}

// --- TEXTAREA (markdown; saves on blur) -------------------------------------
export function InlineTextarea({
  contactId,
  field,
  label,
  value,
  placeholder,
}: BaseProps & { value: string | null; placeholder?: string }) {
  const { state, save } = useFieldSave(contactId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <FieldShell contactId={contactId} field={field} label={label} state={state}>
      <textarea
        rows={4}
        value={val}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if ((value ?? '') !== val) save(val === '' ? null : val);
        }}
        className={`${INPUT_CLS} resize-y font-mono text-sm`}
      />
    </FieldShell>
  );
}

// --- SELECT (saves on change) -----------------------------------------------
export function InlineSelect({
  contactId,
  field,
  label,
  value,
  options,
  allowEmpty,
}: BaseProps & {
  value: string | null;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  const { state, save } = useFieldSave(contactId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <FieldShell contactId={contactId} field={field} label={label} state={state}>
      <select
        value={val}
        onChange={(e) => {
          const next = e.target.value;
          setVal(next);
          save(next === '' ? null : next);
        }}
        className={INPUT_CLS}
      >
        {allowEmpty && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

// --- TOGGLE (boolean; saves on change) --------------------------------------
export function InlineToggle({
  contactId,
  field,
  label,
  value,
}: BaseProps & { value: boolean }) {
  const { state, save } = useFieldSave(contactId, field);
  const [val, setVal] = useState(value);

  return (
    <FieldShell contactId={contactId} field={field} label={label} state={state}>
      <button
        type="button"
        role="switch"
        aria-checked={val}
        onClick={() => {
          const next = !val;
          setVal(next);
          save(next);
        }}
        className={`inline-flex h-6 w-11 items-center rounded-full px-1 transition-colors duration-fast ${
          val ? 'bg-accent' : 'bg-active'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-surface shadow-sm transition-transform duration-fast ${
            val ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </FieldShell>
  );
}
