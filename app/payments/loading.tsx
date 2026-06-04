import { AppShell } from '@/components/shell/AppShell';

// Route-level loading UI for /payments.
export default function Loading() {
  return (
    <AppShell title="Payments">
      <div className="flex flex-col gap-4">
        <div className="h-10 w-full animate-pulse rounded-md bg-subtle" />
        <div className="h-64 w-full animate-pulse rounded-lg bg-subtle" />
        <p className="text-sm text-ink-tertiary">Loading payments…</p>
      </div>
    </AppShell>
  );
}
