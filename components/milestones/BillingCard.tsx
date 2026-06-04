import { formatMoney } from '@/lib/ui-milestones';
import type { MilestoneBilling } from '@/lib/types-milestones';

// BillingCard — READ-ONLY billing surface for a milestone, in the design's
// right-rail .card "Billing · on delivery" shape (Milestone Detail.html). Every
// figure is COMPUTED in v_milestone_billing (agreed = milestone price; received/
// outstanding from confirmed payments) and merely displayed. NO editable money
// fields here (CLAUDE.md rule 2 — editable price lives in the left-rail meta).
//
// 🚨 Rendered ONLY for the full (non-developer) projection. The developer path
// never fetches v_milestone_billing and never renders this — so `card-billing` has
// count 0 for a developer (asserted by the dev-wall spec).
export function BillingCard({ billing }: { billing: MilestoneBilling | null }) {
  const agreed = billing?.agreed ?? null;
  const received = billing?.received ?? null;
  const outstanding = billing?.outstanding ?? null;
  const currency = billing?.currency ?? null;

  const rowBase: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '5px 0',
    fontSize: 13,
  };

  return (
    <div className="card" data-testid="card-billing">
      <div className="card-h">
        <h3>Billing</h3>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}
        >
          on delivery
        </span>
      </div>
      <div className="card-b">
        <div style={rowBase}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Agreed</span>
          <span className="mono" style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
            {formatMoney(agreed, currency)}
          </span>
        </div>
        <div style={{ ...rowBase, borderTop: '1px solid var(--color-border-subtle)' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Received</span>
          <span
            className="mono"
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              color: 'var(--color-success-text)',
            }}
          >
            {formatMoney(received, currency)}
          </span>
        </div>
        <div style={{ ...rowBase, borderTop: '1px solid var(--color-border-subtle)' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Outstanding</span>
          <span
            className="mono"
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              color: 'var(--color-warning-text)',
            }}
          >
            {formatMoney(outstanding, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
