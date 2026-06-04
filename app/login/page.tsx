import { LoginForm } from '@/components/auth/LoginForm';

// /login — magic-link sign-in. Renders fine before Resend is wired; the submit
// surfaces a graceful message if the provider errors (key not set yet).
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-6">
      <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-8 shadow-md">
        <h1 className="font-display text-h1 font-bold tracking-tight text-ink">
          GrowwStacks OS
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Sign in with your work email. We&apos;ll send you a magic link.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-xs text-ink-tertiary">
          Access is invite-only. If your email isn&apos;t provisioned, sign-in
          will be declined.
        </p>
      </div>
    </div>
  );
}
