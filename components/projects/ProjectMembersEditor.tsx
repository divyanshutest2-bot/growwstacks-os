'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { addProjectMember, removeProjectMember } from '@/lib/actions/projects';
import { avatarBg, initials, USER_STATUS_DOT } from '@/lib/ui';
import {
  PROJECT_MEMBER_ROLES,
  PROJECT_MEMBER_ROLE_LABEL,
} from '@/lib/ui-projects';
import type { ProjectMember } from '@/lib/types-projects';
import type { UserOption } from '@/lib/actions/directory';

// ProjectMembersEditor — the design's Owners/Team card: a PM .ostack and a
// developer .ostack. The project_members join is AUTHORITATIVE (CLAUDE.md rule 5);
// project_manager_id is only a cached header pointer. Add/remove are RLS-gated to
// admin/pm; rendered only on the full projection (a developer sees only their own
// membership and cannot mutate).
//
// Preserves the smoke-spec testids: member-chip (each avatar wrap), member-add
// (a SINGLE dashed add button — the spec clicks it without .first()), and
// member-remove (the × on each chip). The user picker is a sibling <div>
// immediately AFTER the member-add button, so `[data-testid="member-add"] ~ div
// button` resolves to an addable user. The picker carries a role selector (pm |
// developer) so a new member lands in the right stack.
export function ProjectMembersEditor({
  projectId,
  members,
  userOptions,
}: {
  projectId: string;
  members: ProjectMember[];
  userOptions: UserOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [pickRole, setPickRole] = useState<string>('developer');

  const memberIds = new Set(members.map((m) => m.user_id));
  const addable = userOptions.filter((u) => !memberIds.has(u.id));

  const pms = members.filter((m) => m.role === 'pm');
  const devs = members.filter((m) => m.role === 'developer');

  function add(userId: string) {
    setPicking(false);
    startTransition(async () => {
      await addProjectMember(projectId, userId, pickRole);
      router.refresh();
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      await removeProjectMember(projectId, userId);
      router.refresh();
    });
  }

  function Stack({ role, list }: { role: string; list: ProjectMember[] }) {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            marginBottom: 8,
          }}
        >
          {role === 'pm' ? 'Project managers' : 'Developers'}
        </div>
        <div className="ostack">
          {list.map((m) => (
            <span
              key={m.user_id}
              className="wrap"
              data-testid="member-chip"
              title={`${m.full_name ?? m.email ?? m.user_id} · ${
                PROJECT_MEMBER_ROLE_LABEL[m.role] ?? m.role
              }`}
              style={{ position: 'relative' }}
            >
              <span className="avatar" style={{ background: avatarBg(m.user_id) }}>
                {initials(m.full_name ?? m.email)}
              </span>
              <span
                className="sdot"
                style={{
                  background: USER_STATUS_DOT['active'] ?? 'var(--color-status-active)',
                }}
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
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-h">
        <h3>Owners</h3>
        {pending && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Saving…
          </span>
        )}
      </div>
      <div className="card-b">
        {members.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
            No team members yet
          </p>
        )}
        <Stack role="pm" list={pms} />
        <Stack role="developer" list={devs} />

        {/* SINGLE add control + sibling picker (role select + addable users). */}
        <div className="multi" style={{ position: 'relative' }}>
          <button
            type="button"
            data-testid="member-add"
            className="add"
            aria-label="Add member"
            onClick={() => setPicking((p) => !p)}
          >
            <Plus size={13} />
          </button>
          {picking && (
            <div
              className="menu"
              style={{ top: 'calc(100% + 6px)', left: 0, maxHeight: 280, overflowY: 'auto', minWidth: 200 }}
            >
              <div style={{ padding: '4px 8px 6px' }}>
                <select
                  aria-label="Member role"
                  value={pickRole}
                  onChange={(e) => setPickRole(e.target.value)}
                  style={{
                    width: '100%',
                    fontSize: 12,
                    padding: '4px 6px',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-bg-surface)',
                    color: 'var(--color-text-primary)',
                    outline: 0,
                  }}
                >
                  {PROJECT_MEMBER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {PROJECT_MEMBER_ROLE_LABEL[r]}
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
    </div>
  );
}
