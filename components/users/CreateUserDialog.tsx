'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { UserPlus } from 'lucide-react';

import { createUser } from '@/lib/actions/users';
import { USER_ROLES, ROLE_LABEL } from '@/lib/ui-users';

// CreateUserDialog — "New user" button + inline modal. ADMIN-ONLY (rendered only
// when the viewer is admin; createUser is RLS-gated to admin regardless).
// Provisioning a user row is what ENABLES their invite-only magic-link login.
// createUser returns a WriteResult — a refusal surfaces inline rather than throws.
export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('developer');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFullName('');
    setEmail('');
    setRole('developer');
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createUser({ full_name: fullName, email, role });
      if (res.ok) {
        const created = res.row as { id: string };
        setOpen(false);
        reset();
        router.push(`/users/${created.id}`);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const fieldCls =
    'w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast focus:border-border-focus focus:shadow-focus';

  return (
    <>
      <button
        type="button"
        data-testid="user-create-btn"
        onClick={() => setOpen(true)}
        className="btn btn-primary"
      >
        <UserPlus size={16} />
        Invite user
      </button>

      {open && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-overlay p-6">
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-lg">
            <h2 className="font-display text-h3 font-bold tracking-tight text-ink">
              Invite a new user
            </h2>
            <p className="mt-1 text-sm text-ink-secondary">
              Creating the row enables their invite-only login.
            </p>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-ink" htmlFor="nu-name">
                Full name
              </label>
              <input
                id="nu-name"
                data-testid="create-user-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={fieldCls}
                placeholder="Jane Doe"
              />

              <label className="text-sm font-medium text-ink" htmlFor="nu-email">
                Email
              </label>
              <input
                id="nu-email"
                data-testid="create-user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldCls}
                placeholder="jane@growwstacks.com"
              />

              <label className="text-sm font-medium text-ink" htmlFor="nu-role">
                Role
              </label>
              <select
                id="nu-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={fieldCls}
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger-text"
                >
                  {error}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="rounded-md border border-border-subtle bg-surface px-4 py-2 text-sm text-ink-secondary transition-colors duration-fast hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !fullName.trim() || !email.trim()}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60"
                >
                  {pending ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
