'use client';

import { useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';

import { updateTaskField } from '@/lib/actions/tasks';
import { TASK_STATUSES, TASK_STATUS_LABEL, TASK_STATUS_DOT } from '@/lib/ui-tasks';

// StatusFieldEditor — 🚨 THE KANBAN-STATUS AUTO-SAVE. The design's header status
// pill, implemented as a native <select> styled to read like the .statuspill so:
//   - it AUTO-SAVES on change (no submit button) via updateTaskField('status'),
//   - the smoke test can do getByTestId('task-field-status').locator('select')
//     .selectOption('in_progress') and then assert field-status shows "Saved".
// RLS gates the write (admin/pm always; a developer assignee on their own task).
// The colored dot + chevron sit visually inside the pill; the <select> overlays
// them transparently so the native menu still works.
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function StatusFieldEditor({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const [current, setCurrent] = useState(status);
  const [state, setState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();

  function choose(next: string) {
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    setState('saving');
    startTransition(async () => {
      try {
        await updateTaskField(taskId, 'status', next);
        setState('saved');
      } catch {
        setCurrent(prev);
        setState('error');
      }
    });
  }

  return (
    <span
      data-testid="task-field-status"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <span data-testid="status-pill" className="statuspill" style={{ position: 'relative' }}>
        <span
          className="dot"
          style={{ background: TASK_STATUS_DOT[current] ?? 'var(--color-text-muted)' }}
        />
        <span>{TASK_STATUS_LABEL[current] ?? current}</span>
        <ChevronDown size={13} />
        {/* The native <select> overlays the pill transparently — it is the real,
            auto-saving control the kanban-status test drives. */}
        <select
          data-testid="field-status-select"
          aria-label="Status"
          value={current}
          onChange={(e) => choose(e.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            border: 0,
            background: 'transparent',
            appearance: 'none',
          }}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </span>
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
