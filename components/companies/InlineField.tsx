'use client';

import { useState, useTransition } from 'react';

import { updateCompanyField } from '@/lib/actions/companies';

// InlineField — the FIELD-LEVEL AUTO-SAVE primitive for companies. One editable
// field, saved on blur (text/textarea) or change (select) via
// updateCompanyField(id, field, value). NO submit button, NO batched edit form.
// Each instance owns its own saving/saved/error state, surfaced via the
// `field-status` testid (scoped under company-field-{field}).
//
// The server action is single-column + allowlisted + RLS-gated; this component
// is purely the interaction + status indicator.

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type BaseProps = {
  companyId: string;
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

function useFieldSave(companyId: string, field: string) {
  const [state, setState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function save(value: unknown) {
    setState('saving');
    startTransition(async () => {
      try {
        await updateCompanyField(companyId, field, value);
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
    <div data-testid={`company-field-${field}`} className="flex flex-col gap-1">
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
  companyId,
  field,
  label,
  value,
  placeholder,
  type = 'text',
}: BaseProps & { value: string | null; placeholder?: string; type?: string }) {
  const { state, save } = useFieldSave(companyId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <FieldShell companyId={companyId} field={field} label={label} state={state}>
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
  companyId,
  field,
  label,
  value,
  placeholder,
}: BaseProps & { value: string | null; placeholder?: string }) {
  const { state, save } = useFieldSave(companyId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <FieldShell companyId={companyId} field={field} label={label} state={state}>
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
  companyId,
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
  const { state, save } = useFieldSave(companyId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <FieldShell companyId={companyId} field={field} label={label} state={state}>
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
