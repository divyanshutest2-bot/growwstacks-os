'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { addDealTag, removeDealTag } from '@/lib/actions/deals';
import type { DealTag } from '@/lib/types-deals';

// DealTagsEditor — the cockpit .tag-row of free-text deal tags + a dashed .add,
// inside a .meta-row. Unlike the contact lead-source enum, deal tags are
// arbitrary text, so .add opens an inline input. Multi-value deal_tags join.
// Preserves tag-chip / tag-add / tag-input testids.
export function DealTagsEditor({
  dealId,
  tags,
}: {
  dealId: string;
  tags: DealTag[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  function add() {
    const value = draft.trim();
    if (!value) return;
    setDraft('');
    setAdding(false);
    startTransition(async () => {
      await addDealTag(dealId, value);
      router.refresh();
    });
  }

  function remove(tag: string) {
    startTransition(async () => {
      await removeDealTag(dealId, tag);
      router.refresh();
    });
  }

  return (
    <div className="meta-row">
      <span className="k">Tags</span>
      <div className="tag-row" style={{ marginTop: 4, position: 'relative' }}>
        {tags.map((t) => (
          <span key={t.tag} className="tag" data-testid="tag-chip">
            {t.tag}
            <button
              type="button"
              aria-label={`Remove ${t.tag}`}
              onClick={() => remove(t.tag)}
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
        {adding ? (
          <input
            autoFocus
            data-testid="tag-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              } else if (e.key === 'Escape') {
                setAdding(false);
                setDraft('');
              }
            }}
            onBlur={add}
            placeholder="New tag…"
            aria-label="New tag"
            style={{
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-full)',
              padding: '2px 10px',
              fontSize: 11,
              fontFamily: 'inherit',
              outline: 0,
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-surface)',
              minWidth: 90,
            }}
          />
        ) : (
          <button
            type="button"
            data-testid="tag-add"
            className="add"
            aria-label="Add tag"
            onClick={() => setAdding(true)}
          >
            <Plus size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
