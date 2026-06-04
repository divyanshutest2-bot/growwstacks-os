'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { addLeadSource, removeLeadSource } from '@/lib/actions/contacts';
import { LEAD_SOURCES } from '@/lib/ui';
import type { LeadSource } from '@/lib/types';

function label(src: string): string {
  return src.replace(/_/g, ' ');
}

// LeadSourcesEditor — multi-value lead_source join (add/remove chips).
export function LeadSourcesEditor({
  contactId,
  leadSources,
}: {
  contactId: string;
  leadSources: LeadSource[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          Lead sources
        </span>
        {pending && <span className="text-xs text-ink-tertiary">Saving…</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {leadSources.length === 0 && (
          <span className="text-sm text-ink-tertiary">None</span>
        )}
        {leadSources.map((l) => (
          <span
            key={l.lead_source}
            data-testid="leadsource-chip"
            className="inline-flex items-center gap-2 rounded-full border border-accent-border bg-accent-subtle px-3 py-1 text-sm capitalize text-accent-text"
          >
            {label(l.lead_source)}
            <button
              type="button"
              aria-label={`Remove ${label(l.lead_source)}`}
              onClick={() => remove(l.lead_source)}
              className="text-accent-text transition-colors duration-fast hover:text-danger-text"
            >
              ×
            </button>
          </span>
        ))}

        <div className="relative">
          <button
            type="button"
            data-testid="leadsource-add"
            onClick={() => setPicking((p) => !p)}
            className="inline-flex items-center rounded-full border border-dashed border-border-default px-3 py-1 text-sm text-ink-secondary transition-colors duration-fast hover:bg-hover"
          >
            + Add source
          </button>
          {picking && (
            <div className="absolute z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border-subtle bg-surface p-1 shadow-md">
              {addable.length === 0 ? (
                <p className="px-3 py-2 text-sm text-ink-tertiary">
                  All sources added
                </p>
              ) : (
                addable.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => add(s)}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm capitalize text-ink transition-colors duration-fast hover:bg-hover"
                  >
                    {label(s)}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
