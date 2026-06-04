'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';

import { CompanyDetailInlineText } from '@/components/companies/CompanyDetailInlineField';

// CompanyLocationField — a single composed "Location" read line
// (`City, State · Country`) that expands to the three underlying inline-edit
// fields. Each column auto-saves on its own (company-field-{city,state,country}).
// Mirrors the approved contacts LocationField.
function compose(city: string | null, state: string | null, country: string | null): string {
  const left = [city, state].map((s) => s?.trim()).filter(Boolean).join(', ');
  const parts = [left, country?.trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

export function CompanyLocationField({
  companyId,
  city,
  state,
  country,
}: {
  companyId: string;
  city: string | null;
  state: string | null;
  country: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const composed = compose(city, state, country);

  if (editing) {
    return (
      <>
        <CompanyDetailInlineText companyId={companyId} field="city" label="City" value={city} />
        <CompanyDetailInlineText companyId={companyId} field="state" label="State" value={state} />
        <CompanyDetailInlineText companyId={companyId} field="country" label="Country" value={country} />
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
