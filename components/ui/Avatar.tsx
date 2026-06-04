import { initials } from '@/lib/ui';

/** AvatarChip — initials chip for an owner/user. Token-backed, no images yet. */
export function AvatarChip({
  name,
  title,
}: {
  name: string | null | undefined;
  title?: string;
}) {
  return (
    <span
      title={title ?? name ?? undefined}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-subtle text-accent-text text-xs font-semibold"
    >
      {initials(name)}
    </span>
  );
}
