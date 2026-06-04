'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateDealField } from '@/lib/actions/deals';
import { DEAL_STAGES, DEAL_STAGE_LABEL } from '@/lib/ui-deals';

// DealStageSelect — the per-card restage control on the Kanban board. Full
// drag-and-drop is deferred (heavy + a11y-fraught); this <select> stands in: pick
// a new stage and it auto-saves ONE column (updateDealField(id,'stage',value))
// then refreshes so the card moves to its new lane. Stops click propagation so
// changing the stage doesn't also navigate into the card's detail link.
export function DealStageSelect({
  dealId,
  stage,
}: {
  dealId: string;
  stage: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(stage);
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (next === value) return;
    const prev = value;
    setValue(next);
    startTransition(async () => {
      try {
        await updateDealField(dealId, 'stage', next);
        router.refresh();
      } catch {
        setValue(prev); // revert on failure — never fake the move
      }
    });
  }

  return (
    <div
      className="dstage"
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <select
        value={value}
        aria-label="Deal stage"
        disabled={pending}
        onChange={(e) => change(e.target.value)}
      >
        {DEAL_STAGES.map((s) => (
          <option key={s} value={s}>
            {DEAL_STAGE_LABEL[s] ?? s}
          </option>
        ))}
      </select>
    </div>
  );
}
