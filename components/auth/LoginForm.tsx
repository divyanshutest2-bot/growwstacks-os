'use client';

import { useState, useTransition } from 'react';

import { requestMagicLink } from '@/lib/actions/auth-actions';

type State =
  | { kind: 'idle' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ kind: 'idle' });
    startTransition(async () => {
      const res = await requestMagicLink(email);
      if (res.ok) {
        setState({ kind: 'sent' });
      } else {
        setState({ kind: 'error', message: res.message });
      }
    });
  }

  if (state.kind === 'sent') {
    return (
      <div
        role="status"
        className="rounded-md border border-success-border bg-success-bg p-4 text-sm text-success-text"
      >
        Check your inbox — if your email is provisioned, a sign-in link is on its
        way.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="login-email" className="text-sm font-medium text-ink">
        Work email
      </label>
      <input
        id="login-email"
        data-testid="login-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@growwstacks.com"
        className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow duration-fast placeholder:text-ink-tertiary focus:border-border-focus focus:shadow-focus"
      />
      <button
        type="submit"
        data-testid="login-submit"
        disabled={pending}
        className="mt-1 inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send magic link'}
      </button>
      {state.kind === 'error' && (
        <p
          role="alert"
          className="rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger-text"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
