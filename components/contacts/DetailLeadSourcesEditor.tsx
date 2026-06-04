'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { addLeadSource, removeLeadSource } from '@/lib/actions/contacts';
import { LEAD_SOURCES, LEAD_SOURCE_LABEL } from '@/lib/ui';
import type { LeadSource } from '@/lib/types';

// DetailLeadSourcesEditor — the design's .tag-row of lead-source .tag chips + a
// dashed .add. Multi-value contact_lead_sources join. Preserves leadsource-add /
// leadsource-chip testids.
export function DetailLeadSourcesEditor({
  contactId,
  leadSources,
}: {
  contactId: string;
  leadSources: LeadSource[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);

  const present = new Set(leadSources.map((l) => l.lead_source));
  const addable = LEAD_SOURCES.filter((s) => !present.has(s));

  function add(source: string) {
    setPicking(false);
    startTransition(async () => {
      await addLeadSource(contactId, source);
      router.refresh();
    });
  }

  function remove(source: string) {
    startTransition(async () => {
      await removeLeadSource(contactId, source);
      router.refresh();
    });
  }

  return (
    <div className="meta-row">
      <span className="k">Lead source</span>
      <div className="tag-row" style={{ marginTop: 4, position: 'relative' }}>
        {leadSources.map((l) => (
          <span key={l.lead_source} className="tag" data-testid="leadsource-chip">
            {LEAD_SOURCE_LABEL[l.lead_source] ?? l.lead_source}
            <button
              type="button"
              aria-label={`Remove ${LEAD_SOURCE_LABEL[l.lead_source] ?? l.lead_source}`}
              onClick={() => remove(l.lead_source)}
              style={{
                border: 0,
                background: 'transparent',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          data-testid="leadsource-add"
          className="add"
          aria-label="Add lead source"
          onClick={() => setPicking((p) => !p)}
        >
          <Plus size={12} />
        </button>
        {picking && (
          <div className="menu" style={{ top: 'calc(100% + 6px)', left: 0, maxHeight: 240, overflowY: 'auto' }}>
            {addable.length === 0 ? (
              <button type="button" disabled style={{ color: 'var(--color-text-tertiary)' }}>
                All sources added
              </button>
            ) : (
              addable.map((s) => (
                <button key={s} type="button" onClick={() => add(s)}>
                  {LEAD_SOURCE_LABEL[s] ?? s}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
