'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateUserRole, updateUserStatus } from '@/lib/actions/users';
import {
  USER_ROLES,
  USER_STATUSES,
  ROLE_LABEL,
  USER_STATUS_LABEL,
} from '@/lib/ui-users';

// RoleStatusEditor — the ADMIN-ONLY left-rail editor card for role + status.
//
// 🚨 RENDERED ONLY when the current viewer is admin (the parent page checks
// getCurrentUserRole() and passes nothing otherwise). The UI gate is the first
// line of defence; the HARD backstop is the fn_prevent_role_escalation trigger (a
// non-admin's change RAISEs at the DB), which updateUserRole / updateUserStatus
// catch and return as a structured refusal. So even if this editor somehow
// rendered for a non-admin, the change cannot succeed — and the refusal shows.
//
// Each <select> AUTO-SAVES on change (no submit button). The role-editor /
// status-editor / field-status testids are the canonical admin-editor contract
// the Playwright smoke test drives.

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

const SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 0,
  color: 'var(--color-text-primary)',
  background: 'var(--color-bg-surface)',
};

function StatusLine({ state }: { state: SaveState }) {
  if (state.kind === 'idle') {
    return <span data-testid="field-status" className="ie-saved" style={{ opacity: 0 }} />;
  }
  if (state.kind === 'saving') {
    return (
      <span data-testid="field-status" className="ie-saving">
        Saving…
      </span>
    );
  }
  if (state.kind === 'saved') {
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
      {state.message}
    </span>
  );
}

export function RoleStatusEditor({
  userId,
  role,
  status,
}: {
  userId: string;
  role: string;
  status: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [roleVal, setRoleVal] = useState(role);
  const [statusVal, setStatusVal] = useState(status);
  const [roleState, setRoleState] = useState<SaveState>({ kind: 'idle' });
  const [statusState, setStatusState] = useState<SaveState>({ kind: 'idle' });

  function saveRole(next: string) {
    const prev = roleVal;
    setRoleVal(next);
    setRoleState({ kind: 'saving' });
    startTransition(async () => {
      const res = await updateUserRole(userId, next);
      if (res.ok) {
        setRoleState({ kind: 'saved' });
        router.refresh();
      } else {
        setRoleVal(prev); // revert the select to the unchanged value
        setRoleState({ kind: 'error', message: res.error });
      }
    });
  }

  function saveStatus(next: string) {
    const prev = statusVal;
    setStatusVal(next);
    setStatusState({ kind: 'saving' });
    startTransition(async () => {
      const res = await updateUserStatus(userId, next);
      if (res.ok) {
        setStatusState({ kind: 'saved' });
        router.refresh();
      } else {
        setStatusVal(prev);
        setStatusState({ kind: 'error', message: res.error });
      }
    });
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  };

  return (
    <div className="card" data-testid="role-editor" style={{ borderColor: 'var(--color-accent-border)' }}>
      <div className="card-h">
        <h3>Admin controls</h3>
      </div>
      <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Only an admin can change role or status. Enforced by the
          fn_prevent_role_escalation trigger at the database layer. Changes are
          logged.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>Role</span>
            <StatusLine state={roleState} />
          </div>
          <select
            value={roleVal}
            aria-label="Role"
            onChange={(e) => saveRole(e.target.value)}
            style={SELECT_STYLE}
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <div
          data-testid="status-editor"
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>Status</span>
            <StatusLine state={statusState} />
          </div>
          <select
            value={statusVal}
            aria-label="Status"
            onChange={(e) => saveStatus(e.target.value)}
            style={SELECT_STYLE}
          >
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {USER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
