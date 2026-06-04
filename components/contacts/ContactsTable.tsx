import Link from 'next/link';

import {
  STATUS_LABEL,
  STATUS_DOT,
  RATING_LABEL,
  LEAD_SOURCE_LABEL,
  USER_STATUS_DOT,
  initials,
  avatarBg,
  relativeTime,
  formatINRLakhs,
} from '@/lib/ui';
import type { ContactRollup } from '@/lib/types';
import type {
  ContactOwnerRow,
  ContactLeadSourceRow,
} from '@/lib/actions/directory';

// ContactsTable — Server Component. Ports Contacts.html's .tbl faithfully, driven
// by real v_contact_rollup rows. Each row is whole-row clickable via a stretched
// <Link> over the contact name cell (a real anchor → accessible + server-rendered).

export function ContactsTable({
  contacts,
  owners,
  leadSources,
  companyNames,
}: {
  contacts: ContactRollup[];
  owners: ContactOwnerRow[];
  leadSources: ContactLeadSourceRow[];
  companyNames: Record<string, string>;
}) {
  const ownersByContact = new Map<string, ContactOwnerRow[]>();
  for (const o of owners) {
    const list = ownersByContact.get(o.contact_id) ?? [];
    list.push(o);
    ownersByContact.set(o.contact_id, list);
  }

  const sourcesByContact = new Map<string, ContactLeadSourceRow[]>();
  for (const s of leadSources) {
    const list = sourcesByContact.get(s.contact_id) ?? [];
    list.push(s);
    sourcesByContact.set(s.contact_id, list);
  }

  return (
    <div className="tbl-wrap">
      <table data-testid="contacts-table" className="tbl">
        <thead>
          <tr>
            <th>Contact</th>
            <th>Status</th>
            <th>Owners</th>
            <th>Lead source</th>
            <th>Projects</th>
            <th className="num">Open tasks</th>
            <th className="num">Lifetime value</th>
            <th className="num">Last activity</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => {
            const rowOwners = ownersByContact.get(c.id) ?? [];
            const rowSources = sourcesByContact.get(c.id) ?? [];
            const company = c.company_id ? companyNames[c.company_id] : null;

            // Lead source: first label + " +N" when there are more.
            const firstSrc = rowSources[0]
              ? LEAD_SOURCE_LABEL[rowSources[0].lead_source] ??
                rowSources[0].lead_source
              : null;
            const extraSrc = Math.max(0, rowSources.length - 1);

            // Projects rollup: "X · Y active" from v_contact_rollup.
            const totalProjects = c.total_projects ?? 0;
            const activeProjects = c.active_projects ?? 0;

            // Open tasks — the view has no open-task count, so we surface open
            // DEALS as the closest available signal (open_deals). 0 = muted.
            const openTasks = c.open_deals ?? 0;
            const tasksHot = openTasks > 2;

            const ltv = formatINRLakhs(c.lifetime_value_received);

            return (
              <tr key={c.id} data-testid="contact-row" style={{ position: 'relative' }}>
                {/* Contact */}
                <td>
                  <div className="cell-name">
                    <span className="avatar" style={{ background: avatarBg(c.id) }}>
                      {initials(c.full_name)}
                    </span>
                    <div>
                      <div className="nm">
                        <Link
                          href={`/contacts/${c.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {c.full_name}
                        </Link>
                      </div>
                      {company ? (
                        <div className="co">{company}</div>
                      ) : (
                        <div
                          className="co"
                          style={{
                            fontStyle: 'italic',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          No company · solo
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td>
                  <span data-testid="status-pill" className="status">
                    <span
                      className="dot"
                      style={{ background: STATUS_DOT[c.status] ?? 'var(--n-400)' }}
                    />
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>

                {/* Owners */}
                <td>
                  {rowOwners.length === 0 ? (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  ) : (
                    <div className="ostack">
                      {rowOwners.map((o) => (
                        <span
                          key={o.user_id}
                          className="wrap"
                          title={o.full_name ?? undefined}
                        >
                          <span
                            className="avatar"
                            style={{ background: avatarBg(o.user_id) }}
                          >
                            {initials(o.full_name)}
                          </span>
                          <span
                            className="sdot"
                            style={{
                              background:
                                USER_STATUS_DOT[o.status ?? 'active'] ??
                                'var(--color-status-active)',
                            }}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Lead source */}
                <td style={{ fontSize: 12 }}>
                  {firstSrc ? (
                    <>
                      {firstSrc}
                      {extraSrc > 0 ? (
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {' '}
                          +{extraSrc}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>

                {/* Projects */}
                <td style={{ fontSize: 12 }}>
                  {totalProjects} · {activeProjects} active
                </td>

                {/* Open tasks */}
                <td className="num">
                  {openTasks > 0 ? (
                    <span
                      className="status"
                      style={{
                        borderColor: 'transparent',
                        background: tasksHot
                          ? 'var(--color-warning-bg)'
                          : 'var(--color-bg-subtle)',
                        color: tasksHot
                          ? 'var(--color-warning-text)'
                          : 'var(--color-text-secondary)',
                      }}
                    >
                      {openTasks}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>0</span>
                  )}
                </td>

                {/* Lifetime value */}
                <td
                  className="num mono"
                  style={{
                    fontWeight: 500,
                    color:
                      ltv === '—'
                        ? 'var(--color-text-muted)'
                        : 'var(--color-text-primary)',
                  }}
                >
                  {ltv}
                </td>

                {/* Last activity */}
                <td
                  className="num"
                  style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}
                >
                  {relativeTime(c.last_activity_at)}
                </td>

                {/* Rating */}
                <td>
                  {c.rating ? (
                    <span data-testid="rating-badge" className={`rating ${c.rating}`}>
                      {RATING_LABEL[c.rating] ?? c.rating}
                    </span>
                  ) : (
                    <span
                      data-testid="rating-badge"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
