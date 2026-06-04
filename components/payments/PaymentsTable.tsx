import Link from 'next/link';
import { Receipt, Handshake } from 'lucide-react';

import {
  formatMoney,
  formatDate,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_DOT,
} from '@/lib/ui-payments';
import type { PaymentRow } from '@/lib/types-payments';

// PaymentsTable — Server Component. Ports Payments.html's .tbl faithfully (money-
// forward: amount, status lifecycle, against-tag, due date), driven by real
// payment rows. Mirrors the approved ContactsTable: each row is whole-row
// clickable via a stretched <Link> over the payment-id cell. Status is a read-only
// .status pill (the finance-gated confirm lives on the detail page, never inline).
//
// Rows are keyed/located by display_id (PMT-####) in tests, NEVER by amount/note
// (the test-isolation lesson from PROGRESS.md).
export function PaymentsTable({ payments }: { payments: PaymentRow[] }) {
  return (
    <div className="tbl-wrap">
      <table data-testid="payments-table" className="tbl">
        <thead>
          <tr>
            <th>Payment</th>
            <th>Against</th>
            <th className="num">Amount</th>
            <th>Status</th>
            <th className="num">Date</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const overdue = p.status === 'overdue';
            return (
              <tr
                key={p.id}
                data-testid="payment-row"
                data-display-id={p.display_id}
                style={{ position: 'relative' }}
              >
                {/* Payment — receipt glyph + display_id + txn ref / deal-id sub */}
                <td>
                  <div className="cell-name">
                    <span
                      className="logo"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: 'var(--color-bg-subtle)',
                        color: 'var(--color-text-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                      }}
                    >
                      <Receipt size={15} aria-hidden />
                    </span>
                    <div>
                      <div className="nm mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        <Link
                          href={`/payments/${p.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {p.display_id}
                        </Link>
                      </div>
                      <div className="co">
                        {p.transaction_ref ?? p.deal_display_id ?? '—'}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Against — the parent deal (most-specific link not joined in list) */}
                <td>
                  {p.deal_name ? (
                    <span className="against">
                      <Handshake size={11} aria-hidden />
                      {p.deal_name}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>

                {/* Amount — written money fact (not computed) */}
                <td className="num mono" style={{ fontWeight: 600, fontSize: 14 }}>
                  {formatMoney(p.amount, p.currency)}
                </td>

                {/* Status — read-only lifecycle pill */}
                <td>
                  <span data-testid="status-pill" className="status">
                    <span
                      className="dot"
                      style={{ background: PAYMENT_STATUS_DOT[p.status] ?? 'var(--color-text-muted)' }}
                    />
                    {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </td>

                {/* Date — overdue rows read in the danger color */}
                <td
                  className="num mono"
                  style={{
                    color: overdue ? 'var(--color-danger-text)' : 'var(--color-text-secondary)',
                  }}
                >
                  {formatDate(p.payment_date)}
                </td>

                {/* Type */}
                <td style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {p.payment_type ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
