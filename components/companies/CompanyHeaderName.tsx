'use client';

import { useState, useTransition } from 'react';

import { updateCompanyField } from '@/lib/actions/companies';

// CompanyHeaderName — the cockpit header's inline-editable company name (H1).
// The parent wraps this in data-testid="company-field-name"; this component
// renders the always-present <input> (styled as the .dh-title-row h1) and the
// field-status indicator. Field-level auto-save on blur via updateCompanyField.
// Mirrors the approved contacts HeaderName.

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function CompanyHeaderName({
  companyId,
  value,
}: {
  companyId: string;
  value: string;
}) {
  const [state, setState] = useState<SaveState>('idle');
  const [val, setVal] = useState(value ?? '');
  const [, startTransition] = useTransition();

  function save(next: string) {
    setState('saving');
    startTransition(async () => {
      try {
        await updateCompanyField(companyId, 'name', next);
        setState('saved');
      } catch {
        setState('error');
      }
    });
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <input
        value={val}
        aria-label="Company name"
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if ((value ?? '') !== val && val.trim() !== '') save(val.trim());
        }}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 27,
          fontWeight: 700,
          letterSpacing: '-.02em',
          color: 'var(--color-text-primary)',
          border: '1px solid transparent',
          borderRadius: 'var(--radius-sm)',
          outline: 0,
          background: 'transparent',
          padding: '2px 6px',
          margin: '-2px -6px',
          minWidth: 0,
          maxWidth: '100%',
        }}
      />
      <FieldStatus state={state} />
    </span>
  );
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
    <span data-testid="field-status" className="ie-saving" style={{ color: 'var(--color-danger-text)' }}>
      Save failed
    </span>
  );
}
