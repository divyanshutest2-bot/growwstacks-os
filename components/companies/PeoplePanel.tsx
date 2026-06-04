import Link from 'next/link';
import { Users, Plus, Check, ChevronRight } from 'lucide-react';

import { avatarBg, initials, STATUS_DOT } from '@/lib/ui';
import type { CompanyContactRow } from '@/lib/types';

// PeoplePanel — the company cockpit's CENTER-OF-GRAVITY (per Company Detail.html).
// A container of the company's contacts: each row shows avatar + status dot, name,
// role (job_title), a portal-access indicator, and links to that contact's detail.
// Server Component — pure projection of listCompanyContacts (RLS-gated upstream).
export function PeoplePanel({ contacts }: { contacts: CompanyContactRow[] }) {
  return (
    <div className="card" data-testid="card-people">
      <div className="card-h">
        <Users size={16} style={{ color: 'var(--color-accent)' }} />
        <h3>People</h3>
        <span className="cnt">
          {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
        </span>
        <Link
          href="/contacts"
          className="btn btn-ghost btn-sm more"
          style={{ padding: '4px 8px' }}
        >
          <Plus size={14} />
          Add person
        </Link>
      </div>
      <div>
        {contacts.length === 0 ? (
          <p style={{ padding: '14px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            No people linked to this company yet.
          </p>
        ) : (
          contacts.map((c) => (
            <Link key={c.id} className="person" href={`/contacts/${c.id}`}>
              <span className="pavatar">
                <span className="avatar" style={{ background: avatarBg(c.id) }}>
                  {initials(c.full_name)}
                </span>
                <span
                  className="pdot"
                  style={{ background: STATUS_DOT[c.status] ?? 'var(--color-status-active)' }}
                />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pn">{c.full_name}</div>
                <div className="pr">{c.display_id}</div>
              </div>
              {c.is_client_portal_enabled ? (
                <span className="portal-pill">
                  <Check size={11} />
                  Portal
                </span>
              ) : (
                <span className="portal-none">No portal access</span>
              )}
              <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
