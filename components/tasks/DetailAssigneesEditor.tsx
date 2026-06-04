'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { addTaskAssignee, removeTaskAssignee } from '@/lib/actions/tasks';
import { avatarBg, initials } from '@/lib/ui';
import type { TaskAssignee } from '@/lib/types-tasks';
import type { UserOption } from '@/lib/actions/directory';

// DetailAssigneesEditor — the design's .ostack avatar stack of assignees (the
// developers on this task) + a dashed .add control opening a user picker. Multi-
// assignee via the task_assignees join (CLAUDE.md rule 5 — never a single FK).
// add/remove are RLS-gated to admin/pm; the picker is only populated when the
// caller can manage (userOptions empty otherwise → "No more users").
//
// Preserves the testids the smoke spec drives: assignee-chip / assignee-add /
// assignee-remove. The picker menu is a SIBLING div of the add button so the
// test's `[data-testid="assignee-add"] ~ div button` selector resolves.
export function DetailAssigneesEditor({
  taskId,
  assignees,
  userOptions,
}: {
  taskId: string;
  assignees: TaskAssignee[];
  userOptions: UserOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);

  const assigneeIds = new Set(assignees.map((a) => a.user_id));
  const addable = userOptions.filter((u) => !assigneeIds.has(u.id));

  function add(userId: string) {
    setPicking(false);
    startTransition(async () => {
      await addTaskAssignee(taskId, userId);
      router.refresh();
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      await removeTaskAssignee(taskId, userId);
      router.refresh();
    });
  }

  return (
    <div className="meta-row">
      <span className="k">Assignees</span>
      <div className="multi" style={{ marginTop: 4, position: 'relative' }}>
        <div className="ostack">
          {assignees.map((a) => (
            <span
              key={a.user_id}
              className="wrap"
              data-testid="assignee-chip"
              title={a.full_name ?? a.email ?? a.user_id}
              style={{ position: 'relative' }}
            >
              <span className="avatar" style={{ background: avatarBg(a.user_id) }}>
                {initials(a.full_name ?? a.email)}
              </span>
              <button
                type="button"
                data-testid="assignee-remove"
                aria-label={`Remove ${a.full_name ?? 'assignee'}`}
                onClick={() => remove(a.user_id)}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: 0,
                  background: 'var(--color-bg-surface)',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 11,
                  lineHeight: '12px',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          data-testid="assignee-add"
          className="add"
          aria-label="Add assignee"
          style={{ marginLeft: 4 }}
          onClick={() => setPicking((p) => !p)}
        >
          <Plus size={13} />
        </button>
        {picking && (
          <div
            className="menu"
            style={{ top: 'calc(100% + 6px)', left: 0, maxHeight: 240, overflowY: 'auto' }}
          >
            {addable.length === 0 ? (
              <button type="button" disabled style={{ color: 'var(--color-text-tertiary)' }}>
                No more users
              </button>
            ) : (
              addable.map((u) => (
                <button key={u.id} type="button" onClick={() => add(u.id)}>
                  {u.full_name ?? u.email ?? u.id}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
