'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { addTaskManager, removeTaskManager } from '@/lib/actions/tasks';
import { avatarBg, initials, USER_STATUS_DOT } from '@/lib/ui';
import type { TaskManager } from '@/lib/types-tasks';
import type { UserOption } from '@/lib/actions/directory';

// DetailManagersEditor — the design's .ostack avatar stack of managers (the PMs
// on this task) + a dashed .add control. Multi-PM via the task_managers join,
// which is AUTHORITATIVE (CLAUDE.md rule 5); primary_pm_id is only a cached
// header pointer. add/remove are RLS-gated to admin/pm.
//
// Preserves the testids the spec references: manager-chip / manager-add (+
// manager-remove for symmetry with assignees).
export function DetailManagersEditor({
  taskId,
  managers,
  userOptions,
}: {
  taskId: string;
  managers: TaskManager[];
  userOptions: UserOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);

  const managerIds = new Set(managers.map((m) => m.user_id));
  const addable = userOptions.filter((u) => !managerIds.has(u.id));

  function add(userId: string) {
    setPicking(false);
    startTransition(async () => {
      await addTaskManager(taskId, userId);
      router.refresh();
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      await removeTaskManager(taskId, userId);
      router.refresh();
    });
  }

  return (
    <div className="meta-row">
      <span className="k">Managers</span>
      <div className="multi" style={{ marginTop: 4, position: 'relative' }}>
        <div className="ostack">
          {managers.map((m) => (
            <span
              key={m.user_id}
              className="wrap"
              data-testid="manager-chip"
              title={m.full_name ?? m.email ?? m.user_id}
              style={{ position: 'relative' }}
            >
              <span className="avatar" style={{ background: avatarBg(m.user_id) }}>
                {initials(m.full_name ?? m.email)}
              </span>
              <span className="sdot" style={{ background: USER_STATUS_DOT.active }} />
              <button
                type="button"
                data-testid="manager-remove"
                aria-label={`Remove ${m.full_name ?? 'manager'}`}
                onClick={() => remove(m.user_id)}
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
          data-testid="manager-add"
          className="add"
          aria-label="Add manager"
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
