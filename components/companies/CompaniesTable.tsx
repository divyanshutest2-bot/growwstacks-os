import Link from 'next/link';
import { Users } from 'lucide-react';

import {
  COMPANY_TYPE_LABEL,
  COMPANY_TYPE_DOT,
  initials,
  avatarBg,
  relativeTime,
  formatINRLakhs,
  USER_STATUS_DOT,
} from '@/lib/ui';
import type { CompanyRollup } from '@/lib/types';
import type { UserOption } from '@/lib/actions/directory';

// CompaniesTable — Server Component. Ports Companies.html's .tbl faithfully,
// driven by real v_company_rollup rows. Each row is whole-row clickable via a
// stretched <Link> over the company name cell (a real anchor → accessible +
// server-rendered). Mirrors the approved ContactsTable.
//
// SCHEMA NOTES (honest, no faked data):
//   - Companies have a SINGLE account_owner_id (no owner join), so the Owner
//     column renders that one owner avatar (or — when unassigned).
//   - v_company_rollup exposes contact_count / total_projects / active_projects /
//     lifetime_value_received / total_deals. It has NO open-task aggregate, NO
//     last_activity_at, and companies have NO rating column. Those cells degrade
//     to honest fallbacks (Open deals → total_deals, the closest open-work
//     signal; Last activity → updated_at; Rating → —).

export function CompaniesTable({
  companies,
  owners,
}: {
  companies: CompanyRollup[];
  owners: Record<string, UserOption>;
}) {
  return (
    <div className="tbl-wrap">
      <table data-testid="companies-table" className="tbl">
        <thead>
          <tr>
            <th>Company</th>
            <th>Status</th>
            <th>Industry</th>
            <th>Owner</th>
            <th className="num">Contacts</th>
            <th>Projects</th>
            <th className="num">Open deals</th>
            <th className="num">Lifetime value</th>
            <th className="num">Last activity</th>
            <th>Rating</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((co) => {
            const owner = co.account_owner_id ? owners[co.account_owner_id] ?? null : null;

            const totalProjects = co.total_projects ?? 0;
            const activeProjects = co.active_projects ?? 0;
            const contactCount = co.contact_count ?? 0;

            // No open-task aggregate in the view; total_deals is the closest
            // open-work signal (same honest substitution as ContactsTable).
            const openDeals = co.total_deals ?? 0;
            const dealsHot = openDeals > 2;

            const ltv = formatINRLakhs(co.lifetime_value_received);

            return (
              <tr key={co.id} data-testid="company-row" style={{ position: 'relative' }}>
                {/* Company */}
                <td>
                  <div className="cell-name">
                    <span className="logo" style={{ background: avatarBg(co.id) }}>
                      {initials(co.name)}
                    </span>
                    <div>
                      <div className="nm">
                        <Link
                          href={`/companies/${co.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {co.name}
                        </Link>
                      </div>
                      <div
                        className="co mono"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}
                      >
                        {co.display_id}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Status (company type) */}
                <td>
                  <span data-testid="status-pill" className="status">
                    <span
                      className="dot"
                      style={{ background: COMPANY_TYPE_DOT[co.type ?? ''] ?? 'var(--n-400)' }}
                    />
                    {co.type ? COMPANY_TYPE_LABEL[co.type] ?? co.type : '—'}
                  </span>
                </td>

                {/* Industry */}
                <td style={{ fontSize: 12 }}>
                  {co.industry ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                </td>

                {/* Owner (single account_owner_id) */}
                <td>
                  {owner ? (
                    <div className="ostack">
                      <span className="wrap" title={owner.full_name ?? owner.email ?? owner.id}>
                        <span className="avatar" style={{ background: avatarBg(owner.id) }}>
                          {initials(owner.full_name ?? owner.email)}
                        </span>
                        <span className="sdot" style={{ background: USER_STATUS_DOT.active }} />
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>

                {/* Contacts */}
                <td className="num">
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                  >
                    <Users size={13} style={{ color: 'var(--color-text-muted)' }} />
                    {contactCount}
                  </span>
                </td>

                {/* Projects */}
                <td style={{ fontSize: 12 }}>
                  {totalProjects} · {activeProjects} active
                </td>

                {/* Open deals */}
                <td className="num">
                  {openDeals > 0 ? (
                    <span
                      className="status"
                      style={{
                        borderColor: 'transparent',
                        background: dealsHot
                          ? 'var(--color-warning-bg)'
                          : 'var(--color-bg-subtle)',
                        color: dealsHot
                          ? 'var(--color-warning-text)'
                          : 'var(--color-text-secondary)',
                      }}
                    >
                      {openDeals}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>0</span>
                  )}
                </td>

                {/* Lifetime value */}
                <td
                  className="num mono"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 500,
                    color:
                      ltv === '—' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                  }}
                >
                  {ltv}
                </td>

                {/* Last activity (no rollup column — use updated_at) */}
                <td className="num" style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {relativeTime(co.updated_at)}
                </td>

                {/* Rating — companies have no rating column (contact-only). */}
                <td>
                  <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
