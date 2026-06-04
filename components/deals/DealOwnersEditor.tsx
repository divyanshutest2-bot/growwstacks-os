'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { addDealOwner, removeDealOwner } from '@/lib/actions/deals';
import { avatarBg, initials, USER_STATUS_DOT } from '@/lib/ui';
import type { DealOwner } from '@/lib/types-deals';
import type { UserOption } from '@/lib/actions/directory';

// DealOwnersEditor — the cockpit .ostack owner avatar stack (with a user-status
// dot per owner) + a dashed .add control, inside a .meta-row. Multi-owner via the
// deal_owners join. Mirrors contacts' DetailOwnersEditor and preserves the
// owner-add / owner-chip / owner-remove testids the smoke spec depends on.
export function DealOwnersEditor({
  dealId,
  owners,
  userOptions,
}: {
  dealId: string;
  owners: DealOwner[];
  userOptions: UserOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);

  const ownerIds = new Set(owners.map((o) => o.user_id));
  const addable = userOptions.filter((u) => !ownerIds.has(u.id));

  function add(userId: string) {
    setPicking(false);
    startTransition(async () => {
      await addDealOwner(dealId, userId);
      router.refresh();
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      await removeDealOwner(dealId, userId);
      router.refresh();
    });
  }

  return (
    <div className="meta-row">
      <span className="k">Owners</span>
      <div className="multi" style={{ marginTop: 4, position: 'relative' }}>
        <div className="ostack">
          {owners.map((o) => (
            <span
              key={o.user_id}
              className="wrap"
              data-testid="owner-chip"
              title={o.full_name ?? o.email ?? o.user_id}
            >
              <span className="avatar" style={{ background: avatarBg(o.user_id) }}>
                {initials(o.full_name ?? o.email)}
              </span>
              <span
                className="sdot"
                style={{ background: USER_STATUS_DOT.active ?? 'var(--color-status-active)' }}
              />
              <button
                type="button"
                data-testid="owner-remove"
                aria-label={`Remove ${o.full_name ?? 'owner'}`}
                onClick={() => remove(o.user_id)}
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
          data-testid="owner-add"
          className="add"
          aria-label="Add owner"
          style={{ marginLeft: 4 }}
          onClick={() => setPicking((p) => !p)}
        >
          <Plus size={13} />
        </button>
        {picking && (
          <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0, maxHeight: 240, overflowY: 'auto' }}>
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
