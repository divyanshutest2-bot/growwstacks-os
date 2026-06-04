'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { updateCompanyField } from '@/lib/actions/companies';
import { avatarBg, initials, USER_STATUS_DOT } from '@/lib/ui';
import type { UserOption } from '@/lib/actions/directory';

// CompanyOwnerEditor — the "Account owner" meta-row. Companies have a SINGLE
// account_owner_id FK (NOT a multi-owner join, the one structural difference
// from Contacts), so ownership is a single avatar + a picker that PATCHes the
// account_owner_id column via updateCompanyField. The dashed .add control opens
// the user menu; selecting one (or "Unassign") auto-saves. Renders the design's
// .ostack avatar + .multi .add affordance.
export function CompanyOwnerEditor({
  companyId,
  ownerId,
  users,
}: {
  companyId: string;
  ownerId: string | null;
  users: UserOption[];
}) {
  const [current, setCurrent] = useState<string | null>(ownerId);
  const [picking, setPicking] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picking) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPicking(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [picking]);

  const owner = current ? users.find((u) => u.id === current) ?? null : null;

  function choose(next: string | null) {
    setPicking(false);
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    startTransition(async () => {
      try {
        await updateCompanyField(companyId, 'account_owner_id', next);
      } catch {
        setCurrent(prev);
      }
    });
  }

  return (
    <div className="meta-row">
      <span className="k">Account owner</span>
      <div ref={ref} className="multi" style={{ marginTop: 4, position: 'relative' }}>
        {owner ? (
          <div className="ostack">
            <span className="wrap" title={owner.full_name ?? owner.email ?? owner.id}>
              <span className="avatar" style={{ background: avatarBg(owner.id) }}>
                {initials(owner.full_name ?? owner.email)}
              </span>
              <span className="sdot" style={{ background: USER_STATUS_DOT.active }} />
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)', marginRight: 4 }}>
            Unassigned
          </span>
        )}
        <button
          type="button"
          className="add"
          aria-label={owner ? 'Change account owner' : 'Assign account owner'}
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
            {owner && (
              <button
                type="button"
                onClick={() => choose(null)}
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Unassign
              </button>
            )}
            {users.map((u) => (
              <button key={u.id} type="button" onClick={() => choose(u.id)}>
                {u.full_name ?? u.email ?? u.id}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
