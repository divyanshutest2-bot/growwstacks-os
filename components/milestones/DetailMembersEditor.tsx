'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import {
  addMilestoneMember,
  removeMilestoneMember,
} from '@/lib/actions/milestones';
import { avatarBg, initials, USER_STATUS_DOT } from '@/lib/ui';
import {
  MILESTONE_MEMBER_ROLES,
  MILESTONE_MEMBER_ROLE_LABEL,
} from '@/lib/ui-milestones';
import type { MilestoneMember } from '@/lib/types-milestones';
import type { UserOption } from '@/lib/actions/directory';

// DetailMembersEditor — the cockpit left-rail team editor in the design's .ostack
// avatar-stack + dashed .add shape. Multi-member via the milestone_members join,
// each with a role (pm | developer); the join is AUTHORITATIVE (CLAUDE.md rule 5).
// Preserves the member-add / member-chip / member-remove testids the smoke spec
// depends on. The add picker is a <div> SIBLING of the member-add button (the spec
// targets `[data-testid="member-add"] ~ div button`). Add/remove are RLS-gated to
// admin/pm; rendered only for the full projection.
export function DetailMembersEditor({
  milestoneId,
  members,
  userOptions,
}: {
  milestoneId: string;
  members: MilestoneMember[];
  userOptions: UserOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [pickRole, setPickRole] = useState<string>('developer');

  const memberIds = new Set(members.map((m) => m.user_id));
  const addable = userOptions.filter((u) => !memberIds.has(u.id));

  function add(userId: string) {
    setPicking(false);
    startTransition(async () => {
      await addMilestoneMember(milestoneId, userId, pickRole);
      router.refresh();
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      await removeMilestoneMember(milestoneId, userId);
      router.refresh();
    });
  }

  return (
    <div className="meta-row">
      <span className="k">Team</span>
      <div className="multi" style={{ marginTop: 4, position: 'relative' }}>
        <div className="ostack">
          {members.map((m) => (
            <span
              key={m.user_id}
              className="wrap"
              data-testid="member-chip"
              title={`${m.full_name ?? m.email ?? m.user_id} · ${
                MILESTONE_MEMBER_ROLE_LABEL[m.role] ?? m.role
              }`}
            >
              <span className="avatar" style={{ background: avatarBg(m.user_id) }}>
                {initials(m.full_name ?? m.email)}
              </span>
              <span
                className="sdot"
                style={{ background: USER_STATUS_DOT.active }}
              />
              <button
                type="button"
                data-testid="member-remove"
                aria-label={`Remove ${m.full_name ?? 'member'}`}
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
          data-testid="member-add"
          className="add"
          aria-label="Add member"
          style={{ marginLeft: 4 }}
          onClick={() => setPicking((p) => !p)}
        >
          <Plus size={13} />
        </button>

        {picking && (
          <div
            className="menu"
            style={{
              top: 'calc(100% + 6px)',
              left: 0,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            <div style={{ padding: '4px 9px 6px' }}>
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                Role
              </span>
              <select
                value={pickRole}
                onChange={(e) => setPickRole(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '5px 7px',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  color: 'var(--color-text-primary)',
                  background: 'var(--color-bg-surface)',
                  outline: 0,
                }}
              >
                {MILESTONE_MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {MILESTONE_MEMBER_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
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
