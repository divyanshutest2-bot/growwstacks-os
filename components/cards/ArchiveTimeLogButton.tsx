'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';

import { archiveTaskTimeLog } from '@/lib/actions/tasks';

// ArchiveTimeLogButton — soft-archives the caller's OWN time log (archive-only;
// RLS time_logs_update gates it to admin or developer-own). Rendered only on the
// caller's own rows (the pane lists only own rows) and only for admin/developer.
export function ArchiveTimeLogButton({ logId }: { logId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      data-testid="time-log-archive"
      aria-label="Archive time log"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await archiveTaskTimeLog(logId);
            router.refresh();
          } catch {
            /* archive-only: on failure the row simply stays */
          }
        })
      }
      className="ml-1 inline-flex items-center text-ink-tertiary transition-colors duration-fast hover:text-danger-text disabled:opacity-50"
    >
      <Trash2 size={13} />
    </button>
  );
}
