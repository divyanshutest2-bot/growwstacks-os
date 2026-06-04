'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { updateUserStatus, updateUserRole } from '@/lib/actions/users';
import {
  USER_ROLES,
  USER_STATUSES,
  ROLE_LABEL,
  USER_STATUS_LABEL,
  USER_STATUS_DOT_VAR,
} from '@/lib/ui-users';

// UserHeaderPills — the design's header status pill (.statuspill) + role pill
// (.rolepill). When the viewer is ADMIN both are clickable, opening a .menu and
// auto-saving via the trigger-backstopped keystone actions (updateUserStatus /
// updateUserRole). For a NON-ADMIN they render as STATIC badges (no menu) — the
// admin gate is in the parent (rendered as static), and the hard backstop is the
// fn_prevent_role_escalation trigger.
//
// NOTE: these header pills DELIBERATELY do not carry the role-editor /
// status-editor testids — those belong to the left-rail RoleStatusEditor (the
// canonical admin editor with <select>s) so the test's selectors stay unique.

export function UserHeaderPills({
  userId,
  role,
  status,
  isAdmin,
}: {
  userId: string;
  role: string;
  status: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [statusVal, setStatusVal] = useState(status);
  const [roleVal, setRoleVal] = useState(role);
  const [openMenu, setOpenMenu] = useState<'status' | 'role' | null>(null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [openMenu]);

  function chooseStatus(next: string) {
    setOpenMenu(null);
    if (next === statusVal) return;
    const prev = statusVal;
    setStatusVal(next);
    startTransition(async () => {
      const res = await updateUserStatus(userId, next);
      if (res.ok) router.refresh();
      else setStatusVal(prev);
    });
  }

  function chooseRole(next: string) {
    setOpenMenu(null);
    if (next === roleVal) return;
    const prev = roleVal;
    setRoleVal(next);
    startTransition(async () => {
      const res = await updateUserRole(userId, next);
      if (res.ok) router.refresh();
      else setRoleVal(prev);
    });
  }

  const statusDot = USER_STATUS_DOT_VAR[statusVal] ?? 'var(--color-text-muted)';

  return (
    <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      {/* Status pill */}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span
          className="statuspill"
          role={isAdmin ? 'button' : undefined}
          tabIndex={isAdmin ? 0 : undefined}
          onClick={
            isAdmin
              ? (e) => {
                  e.stopPropagation();
                  setOpenMenu(openMenu === 'status' ? null : 'status');
                }
              : undefined
          }
          style={isAdmin ? undefined : { cursor: 'default' }}
        >
          <span className="dot" style={{ background: statusDot }} />
          <span>{USER_STATUS_LABEL[statusVal] ?? statusVal}</span>
          {isAdmin && <ChevronDown size={13} />}
        </span>
        {isAdmin && openMenu === 'status' && (
          <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0 }}>
            {USER_STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => chooseStatus(s)}>
                <span
                  className="dot"
                  style={{ background: USER_STATUS_DOT_VAR[s] ?? 'var(--color-text-muted)' }}
                />
                {USER_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </span>

      {/* Role pill */}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span
          className={`rolepill${isAdmin ? ' is-button' : ''}`}
          role={isAdmin ? 'button' : undefined}
          tabIndex={isAdmin ? 0 : undefined}
          onClick={
            isAdmin
              ? (e) => {
                  e.stopPropagation();
                  setOpenMenu(openMenu === 'role' ? null : 'role');
                }
              : undefined
          }
        >
          <Shield size={11} />
          <span>{ROLE_LABEL[roleVal] ?? roleVal}</span>
          {isAdmin && <ChevronDown size={11} />}
        </span>
        {isAdmin && openMenu === 'role' && (
          <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0 }}>
            {USER_ROLES.map((r) => (
              <button key={r} type="button" onClick={() => chooseRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        )}
      </span>
    </span>
  );
}
