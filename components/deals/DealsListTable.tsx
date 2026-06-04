import Link from 'next/link';

import {
  DEAL_STAGE_LABEL,
  DEAL_STAGE_DOT,
  formatMoney,
  formatMoneyCompact,
  stageProbability,
} from '@/lib/ui-deals';
import { initials, avatarBg, USER_STATUS_DOT, formatDate } from '@/lib/ui';
import type { DealRollup } from '@/lib/types-deals';
import type { DealOwnerRow } from '@/lib/actions/deals';

// DealsListTable — the List half of the Board⇄List toggle. Ports Deals.html's
// list view onto the shared .tbl chrome (the same table style the Contacts list
// uses), driven by real v_deal_rollup rows. The whole row links to the deal
// detail via a stretched <Link> over the name cell. Preserves the deals-table /
// deal-row / status-pill testids the smoke spec depends on.
export function DealsListTable({
  deals,
  owners,
  companyNames,
}: {
  deals: DealRollup[];
  owners: DealOwnerRow[];
  companyNames: Record<string, string>;
}) {
  const ownersByDeal = new Map<string, DealOwnerRow[]>();
  for (const o of owners) {
    const list = ownersByDeal.get(o.deal_id) ?? [];
    list.push(o);
    ownersByDeal.set(o.deal_id, list);
  }

  return (
    <div className="tbl-wrap">
      <table data-testid="deals-table" className="tbl">
        <thead>
          <tr>
            <th>Deal</th>
            <th>Stage</th>
            <th className="num">Value</th>
            <th>Owners</th>
            <th className="num">Expected close</th>
            <th className="num">Weighted</th>
            <th className="num">Received</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const rowOwners = ownersByDeal.get(d.id) ?? [];
            const company = d.company_id ? companyNames[d.company_id] : null;
            const valueNum =
              d.deal_value == null ? null : Number(d.deal_value);
            const weighted =
              valueNum == null
                ? null
                : (valueNum * stageProbability(d.stage)) / 100;

            return (
              <tr
                key={d.id}
                data-testid="deal-row"
                style={{ position: 'relative' }}
              >
                {/* Deal */}
                <td>
                  <div className="cell-name">
                    <div>
                      <div className="nm">
                        <Link
                          href={`/deals/${d.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {d.name}
                        </Link>
                      </div>
                      <div className="co">
                        <span
                          className="mono"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          {d.display_id}
                        </span>
                        {company ? ` · ${company}` : ''}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Stage */}
                <td>
                  <span data-testid="status-pill" className="status">
                    <span
                      className="dot"
                      style={{
                        background: DEAL_STAGE_DOT[d.stage] ?? 'var(--n-400)',
                      }}
                    />
                    {DEAL_STAGE_LABEL[d.stage] ?? d.stage}
                  </span>
                </td>

                {/* Value */}
                <td
                  className="num mono"
                  style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}
                >
                  {formatMoney(d.deal_value, d.currency)}
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
                                USER_STATUS_DOT.active ??
                                'var(--color-status-active)',
                            }}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Expected close */}
                <td
                  className="num mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {formatDate(d.close_date)}
                </td>

                {/* Weighted */}
                <td
                  className="num mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {weighted == null
                    ? '—'
                    : formatMoneyCompact(weighted, d.currency)}
                </td>

                {/* Received */}
                <td
                  className="num mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {formatMoney(d.received, d.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
