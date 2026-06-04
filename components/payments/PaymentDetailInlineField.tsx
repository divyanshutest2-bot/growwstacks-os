'use client';

import { useState, useTransition } from 'react';

import { updatePaymentField } from '@/lib/actions/payments';

// PaymentDetailInlineField — the design-styled (.meta-row / .ie) field-level
// auto-save primitive for the Payment Detail cockpit. Same contract as the
// approved contacts/projects inline fields:
//   - root carries data-testid="payment-field-{field}"
//   - a field-status indicator carries data-testid="field-status"
//   - saves ONE allowlisted column via updatePaymentField on blur (text/number/
//     date) / change (select). No submit button, no batched form.
// STATUS IS NOT an inline field here — status transitions go through the finance-
// gated PaymentStatusPill / ConfirmButton / StatusControl so the confirm gate
// stays the single legible path (the keystone of this slice).
//
// 🚨 Date-safe: the neon driver returns date/timestamptz columns as Date OBJECTS.
//    Every read-only AND <input> render coerces Date → 'YYYY-MM-DD' (never renders
//    a raw Date child, never calls .slice() on a Date). Mirrors
//    ProjectDetailInlineField's coercion exactly.

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useFieldSave(paymentId: string, field: string) {
  const [state, setState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function save(value: unknown) {
    setState('saving');
    startTransition(async () => {
      try {
        await updatePaymentField(paymentId, field, value);
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

// Coerce any (Date | ISO string | YYYY-MM-DD | null) to a YYYY-MM-DD string for a
// date field; for non-date text, coerce Date defensively too so a raw Date never
// renders as a React child.
function coerce(value: string | number | Date | null, type: string): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (type === 'date') return String(value).slice(0, 10);
  return String(value);
}

// --- TEXT / NUMBER / DATE (saves on blur for text/number, change for date) ----
export function PaymentDetailInlineText({
  paymentId,
  field,
  label,
  value,
  mono,
  type = 'text',
  numeric = false,
}: {
  paymentId: string;
  field: string;
  label: string;
  value: string | number | Date | null;
  mono?: boolean;
  type?: string;
  numeric?: boolean;
}) {
  const { state, save } = useFieldSave(paymentId, field);
  const sval = coerce(value, type);
  const [val, setVal] = useState(sval);

  // numeric fields emit a Number (or null); text/date emit a string (or null).
  function emit(next: string) {
    if (next === '') return save(null);
    if (numeric) return save(Number(next));
    return save(next);
  }

  return (
    <div className="meta-row" data-testid={`payment-field-${field}`}>
      <span className="k">{label}</span>
      <div className="ie" data-ie="text">
        <input
          type={type}
          inputMode={numeric ? 'decimal' : undefined}
          step={numeric ? '0.01' : undefined}
          value={val}
          aria-label={label}
          onChange={(e) => {
            const next = e.target.value;
            setVal(next);
            // date inputs commit on change (no blur); text/number on blur.
            if (type === 'date') emit(next);
          }}
          onBlur={() => {
            if (type !== 'date' && sval !== val) emit(val);
          }}
          className={mono ? 'mono' : undefined}
          style={mono ? { fontFamily: 'var(--font-mono)', fontSize: 13 } : undefined}
        />
        <FieldStatus state={state} />
      </div>
    </div>
  );
}

// --- TEXTAREA (markdown note; saves on blur) --------------------------------
export function PaymentDetailInlineTextarea({
  paymentId,
  field,
  label,
  value,
}: {
  paymentId: string;
  field: string;
  label: string;
  value: string | null;
}) {
  const { state, save } = useFieldSave(paymentId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`payment-field-${field}`} style={{ alignItems: 'flex-start' }}>
      <span className="k">{label}</span>
      <div className="ie" data-ie="text" style={{ width: '100%' }}>
        <textarea
          rows={3}
          value={val}
          aria-label={label}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            if ((value ?? '') !== val) save(val === '' ? null : val);
          }}
          style={{
            width: '100%',
            border: 0,
            outline: 0,
            resize: 'vertical',
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--color-text-secondary)',
          }}
        />
        <FieldStatus state={state} />
      </div>
    </div>
  );
}

// --- SELECT (saves on change) -----------------------------------------------
export function PaymentDetailInlineSelect({
  paymentId,
  field,
  label,
  value,
  options,
  allowEmpty,
}: {
  paymentId: string;
  field: string;
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  const { state, save } = useFieldSave(paymentId, field);
  const [val, setVal] = useState(value ?? '');

  return (
    <div className="meta-row" data-testid={`payment-field-${field}`}>
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
