import Link from 'next/link';
import { Building2, Calendar } from 'lucide-react';

import { DealStageSelect } from '@/components/deals/DealStageSelect';
import {
  DEAL_STAGE_LABEL,
  DEAL_STAGE_DOT,
  BOARD_OPEN_STAGES,
  isWonStage,
  isLostStage,
  formatMoneyCompact,
  formatDateShort,
} from '@/lib/ui-deals';
import { initials, avatarBg } from '@/lib/ui';
import type { DealRollup } from '@/lib/types-deals';
import type { DealOwnerRow } from '@/lib/actions/deals';

// DealsBoard — the Kanban half of the Board⇄List toggle. Ports Deals.html's board
// faithfully: one lane per open pipeline stage (always shown, even empty) plus
// two DISTINCT terminal lanes (Won = green header, Lost = sunken header). Each
// lane header shows a colored dot, the stage label, a count chip, and the summed
// deal value. Cards show name · contact/company · value · a restage <select> ·
// expected-close chip · owner avatar stack. Whole card links to the detail.
//
// Server Component: the only client island is the per-card DealStageSelect.
type ColumnModel = {
  key: string;
  label: string;
  dot: string;
  kind: 'open' | 'won' | 'lost';
  deals: DealRollup[];
  sum: number;
};

function buildColumns(deals: DealRollup[]): ColumnModel[] {
  const cols: ColumnModel[] = BOARD_OPEN_STAGES.map((s) => ({
    key: s,
    label: DEAL_STAGE_LABEL[s] ?? s,
    dot: DEAL_STAGE_DOT[s] ?? 'var(--n-400)',
    kind: 'open' as const,
    deals: [],
    sum: 0,
  }));

  const won: ColumnModel = {
    key: 'won',
    label: 'Won',
    dot: 'var(--green-500)',
    kind: 'won',
    deals: [],
    sum: 0,
  };
  const lost: ColumnModel = {
    key: 'lost',
    label: 'Lost',
    dot: 'var(--red-500)',
    kind: 'lost',
    deals: [],
    sum: 0,
  };

  const byStage = new Map(cols.map((c) => [c.key, c]));

  for (const d of deals) {
    const value = d.deal_value == null ? 0 : Number(d.deal_value) || 0;
    if (isWonStage(d.stage)) {
      won.deals.push(d);
      won.sum += value;
    } else if (isLostStage(d.stage)) {
      lost.deals.push(d);
      lost.sum += value;
    } else {
      const col = byStage.get(d.stage);
      if (col) {
        col.deals.push(d);
        col.sum += value;
      } else {
        // An open stage not in BOARD_OPEN_STAGES (shouldn't happen) — surface it
        // in the first lane so no deal silently disappears.
        cols[0].deals.push(d);
        cols[0].sum += value;
      }
    }
  }

  return [...cols, won, lost];
}

export function DealsBoard({
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

  const columns = buildColumns(deals);

  return (
    <div className="board-wrap">
      <div className="board">
        {columns.map((col) => (
          <div key={col.key} className={`col ${col.kind}`} data-stage={col.key}>
            <div className="col-h">
              <span className="col-dot" style={{ background: col.dot }} />
              <span className="ct">{col.label}</span>
              <span className="cc">{col.deals.length}</span>
              <span className="cv">
                {col.sum ? formatMoneyCompact(col.sum, col.deals[0]?.currency) : '—'}
              </span>
            </div>
            <div className="col-cards">
              {col.deals.length === 0 ? (
                <div className="col-empty">No deals</div>
              ) : (
                col.deals.map((d) => {
                  const rowOwners = ownersByDeal.get(d.id) ?? [];
                  const company = d.company_id
                    ? companyNames[d.company_id]
                    : null;
                  return (
                    <div key={d.id} className="deal-card" data-testid="deal-card">
                      <Link
                        href={`/deals/${d.id}`}
                        className="after:absolute after:inset-0 after:content-['']"
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        <span className="dn">{d.name}</span>
                      </Link>
                      <div className="dco">
                        <Building2 size={11} aria-hidden />
                        {company ?? d.display_id}
                      </div>
                      <div className="dval">
                        {formatMoneyCompact(d.deal_value, d.currency)}
                      </div>
                      <DealStageSelect dealId={d.id} stage={d.stage} />
                      <div className="dfoot">
                        <span className="dclose">
                          <Calendar size={12} aria-hidden />
                          {formatDateShort(d.close_date)}
                        </span>
                        {rowOwners.length > 0 && (
                          <div className="ostack" style={{ marginLeft: 'auto' }}>
                            {rowOwners.map((o) => (
                              <span
                                key={o.user_id}
                                className="wrap"
                                title={o.full_name ?? undefined}
                              >
                                <span
                                  className="avatar"
                                  style={{
                                    background: avatarBg(o.user_id),
                                    width: 24,
                                    height: 24,
                                    fontSize: 9,
                                  }}
                                >
                                  {initials(o.full_name)}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
