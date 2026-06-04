'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { UserX } from 'lucide-react';

import { archiveUser } from '@/lib/actions/users';

// ArchiveMenu (users) — the ONLY destructive affordance, and it is ARCHIVE, not
// delete (CLAUDE.md rule 4). For users, archive = the KILL SWITCH: REVOKE ACCESS.
// Once archived, fn_my_role() resolves to NULL for that user → RLS denies all
// data on their next request. ADMIN-ONLY (rendered only when the viewer is admin;
// archiveUser is RLS-gated regardless). The header button matches the design's
// danger "Archive" affordance; an explicit confirm modal precedes the action.
// archiveUser returns a WriteResult — a refusal surfaces inline rather than throwing.
export function ArchiveMenu({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function archive() {
    setError(null);
    startTransition(async () => {
      const res = await archiveUser(userId);
      if (res.ok) {
        router.push('/users');
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setConfirming(true)}
        style={{
          color: 'var(--color-danger-text)',
          borderColor: 'var(--color-danger-border)',
        }}
      >
        <UserX size={16} />
        Archive
      </button>

      {confirming && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg-overlay)',
            padding: 24,
          }}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="card-h">
              <h3>Archive {userName}?</h3>
            </div>
            <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                This revokes all access immediately (the kill switch). They are
                denied all data on their next request and bounced within ≤60s.
                Their work history is kept; the row is never deleted and can be
                restored by an admin.
              </p>
              {error && (
                <p
                  role="alert"
                  style={{
                    fontSize: 12.5,
                    color: 'var(--color-danger-text)',
                    border: '1px solid var(--color-danger-border)',
                    background: 'var(--color-danger-bg)',
                    borderRadius: 'var(--radius-md)',
                    padding: 10,
                  }}
                >
                  {error}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setConfirming(false);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={archive}
                  disabled={pending}
                  style={{
                    background: 'var(--color-danger-solid)',
                    color: 'var(--color-text-on-accent)',
                    borderColor: 'transparent',
                  }}
                >
                  {pending ? 'Archiving…' : 'Archive'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
