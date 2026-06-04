'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';

import { DetailInlineText } from '@/components/contacts/DetailInlineField';

// LocationField — the design's single composed "Location" read line
// (`City, State · Country`) that expands to reveal the three underlying
// inline-edit fields. The schema stores city/state/country as separate columns,
// so each edit field keeps its own contact-field-{city,state,country} testid and
// single-column auto-save contract (via DetailInlineText) — the composed line is
// purely a read affordance.
function compose(city: string | null, state: string | null, country: string | null): string {
  const left = [city, state].map((s) => s?.trim()).filter(Boolean).join(', ');
  const parts = [left, country?.trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

export function LocationField({
  contactId,
  city,
  state,
  country,
}: {
  contactId: string;
  city: string | null;
  state: string | null;
  country: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const composed = compose(city, state, country);

  if (editing) {
    return (
      <>
        <DetailInlineText contactId={contactId} field="city" label="City" value={city} />
        <DetailInlineText contactId={contactId} field="state" label="State" value={state} />
        <DetailInlineText contactId={contactId} field="country" label="Country" value={country} />
      </>
    );
  }

  return (
    <div className="meta-row">
      <span className="k">Location</span>
      <div
        className="ie"
        data-ie="text"
        role="button"
        tabIndex={0}
        aria-label="Edit location"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        <span className="ie-val">{composed}</span>
        <Pencil size={13} className="ie-pencil" />
      </div>
    </div>
  );
}
