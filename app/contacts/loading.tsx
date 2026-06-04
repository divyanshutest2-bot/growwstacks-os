import { AppShell } from '@/components/shell/AppShell';

// Route-level loading UI for /contacts.
export default function Loading() {
  return (
    <AppShell title="Contacts">
      <div className="flex flex-col gap-4">
        <div className="h-10 w-full animate-pulse rounded-md bg-subtle" />
        <div className="h-64 w-full animate-pulse rounded-lg bg-subtle" />
        <p className="text-sm text-ink-tertiary">Loading contacts…</p>
      </div>
    </AppShell>
  );
}
