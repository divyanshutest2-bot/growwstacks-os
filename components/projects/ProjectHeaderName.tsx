'use client';

import { useState, useTransition } from 'react';

import { updateProjectField } from '@/lib/actions/projects';

// ProjectHeaderName — the cockpit header's inline-editable project name (H1). The
// parent wraps this in data-testid="project-field-name"; this component renders
// the always-present <input> (styled as the .ptitle H1) and the field-status
// indicator. Field-level auto-save on blur via updateProjectField('name').
// Mirrors the approved contacts/companies HeaderName. RLS gates the write
// (fn_can_edit('project') is admin/pm only → developer UPDATEs return zero rows).

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function ProjectHeaderName({
  projectId,
  value,
}: {
  projectId: string;
  value: string;
}) {
  const [state, setState] = useState<SaveState>('idle');
  const [val, setVal] = useState(value ?? '');
  const [, startTransition] = useTransition();

  function save(next: string) {
    setState('saving');
    startTransition(async () => {
      try {
        await updateProjectField(projectId, 'name', next);
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
        aria-label="Project name"
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if ((value ?? '') !== val && val.trim() !== '') save(val.trim());
        }}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
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
