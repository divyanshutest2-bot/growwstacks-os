'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { addContactOwner, removeContactOwner } from '@/lib/actions/contacts';
import { AvatarChip } from '@/components/ui/Avatar';
import type { ContactOwner } from '@/lib/types';
import type { UserOption } from '@/lib/actions/directory';

// OwnersEditor — multi-owner via the contact_owners join (add/remove). Shows all
// owners as chips. Ownership is the join table, never a single FK (CLAUDE.md 5).
export function OwnersEditor({
  contactId,
  owners,
  userOptions,
}: {
  contactId: string;
  owners: ContactOwner[];
  userOptions: UserOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);

  const ownerIds = new Set(owners.map((o) => o.user_id));
  const addable = userOptions.filter((u) => !ownerIds.has(u.id));

  function add(userId: string) {
    setPicking(false);
    startTransition(async () => {
      await addContactOwner(contactId, userId);
      router.refresh();
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      await removeContactOwner(contactId, userId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          Owners
        </span>
        {pending && <span className="text-xs text-ink-tertiary">Saving…</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {owners.length === 0 && (
          <span className="text-sm text-ink-tertiary">No owners yet</span>
        )}
        {owners.map((o) => (
          <span
            key={o.user_id}
            data-testid="owner-chip"
            className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-subtle py-1 pl-1 pr-2 text-sm text-ink"
          >
            <AvatarChip name={o.full_name} />
            <span>{o.full_name ?? o.email ?? o.user_id}</span>
            <button
              type="button"
              data-testid="owner-remove"
              aria-label={`Remove ${o.full_name ?? 'owner'}`}
              onClick={() => remove(o.user_id)}
              className="text-ink-tertiary transition-colors duration-fast hover:text-danger-text"
            >
              ×
            </button>
          </span>
        ))}

        <div className="relative">
          <button
            type="button"
            data-testid="owner-add"
            onClick={() => setPicking((p) => !p)}
            className="inline-flex items-center rounded-full border border-dashed border-border-default px-3 py-1 text-sm text-ink-secondary transition-colors duration-fast hover:bg-hover"
          >
            + Add owner
          </button>
          {picking && (
            <div className="absolute z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border-subtle bg-surface p-1 shadow-md">
              {addable.length === 0 ? (
                <p className="px-3 py-2 text-sm text-ink-tertiary">
                  No more users
                </p>
              ) : (
                addable.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => add(u.id)}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink transition-colors duration-fast hover:bg-hover"
                  >
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
