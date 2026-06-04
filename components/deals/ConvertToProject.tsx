'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  PartyPopper,
  ArrowRightCircle,
  CircleCheck,
  Kanban,
  ChevronRight,
} from 'lucide-react';

import { convertDealToProject } from '@/lib/actions/deals';
import type { DealProjectRow } from '@/lib/types-deals';

// ConvertToProject — the right-rail action card from Deal Detail.html. Three
// states:
//   1. A project already exists → show the linked project (no convert button).
//   2. Deal is WON and no project yet → the green "Deal won" convert panel.
//   3. Deal is open → a muted note that convert unlocks on win (action present
//      but disabled, never absent — module completeness).
export function ConvertToProject({
  dealId,
  isWon,
  projects,
}: {
  dealId: string;
  isWon: boolean;
  projects: DealProjectRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<DealProjectRow | null>(null);

  const existing = created ?? projects[0] ?? null;

  function convert() {
    setError(null);
    startTransition(async () => {
      try {
        const proj = (await convertDealToProject(dealId)) as DealProjectRow;
        setCreated(proj);
        router.refresh();
      } catch {
        setError('Could not convert — you may not have permission.');
      }
    });
  }

  // State 1 — already converted / has a linked project.
  if (existing) {
    return (
      <div className="card" data-testid="card-convert">
        <div className="card-b">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CircleCheck size={16} style={{ color: 'var(--color-success-fg)' }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Converted to project</span>
          </div>
          <Link
            href={`/projects/${existing.id}`}
            className="sum"
            style={{ textDecoration: 'none', borderTop: 0 }}
          >
            <Kanban size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            <div className="t">
              <div className="l1">{existing.name}</div>
              <div className="l2 mono" style={{ fontFamily: 'var(--font-mono)' }}>
                {existing.display_id}
              </div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
          </Link>
        </div>
      </div>
    );
  }

  // State 3 — open deal, not yet won. Action present but gated.
  if (!isWon) {
    return (
      <div className="card" data-testid="card-convert">
        <div className="card-b">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <ArrowRightCircle size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Convert to project</span>
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--color-text-secondary)',
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            Available once this deal is won — milestones, tasks and billing then
            carry over to a delivery project.
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled
          >
            <ArrowRightCircle size={16} />
            Convert to project
          </button>
        </div>
      </div>
    );
  }

  // State 2 — won, no project yet. The green convert panel.
  return (
    <div className="card convert" data-testid="card-convert">
      <div className="card-b">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <PartyPopper size={16} style={{ color: 'var(--color-success-text)' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-success-text)' }}>
            Deal won
          </span>
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          Turn this into a delivery project — milestones, tasks and billing carry
          over automatically.
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={pending}
          onClick={convert}
        >
          <ArrowRightCircle size={16} />
          {pending ? 'Converting…' : 'Convert to project'}
        </button>
        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-danger-text)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
