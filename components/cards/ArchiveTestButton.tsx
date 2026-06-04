'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';

import { archiveTest } from '@/lib/actions/tests';

// ArchiveTestButton — soft-archives a test (archive-only). RLS tests_update gates
// it: fn_can_edit(parent) OR tester-self. Rendered only where the caller can
// edit the parent or is the tester; RLS is the enforcement, so on failure the
// row simply stays.
export function ArchiveTestButton({ testId }: { testId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      data-testid="test-archive"
      aria-label="Archive test"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await archiveTest(testId);
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
