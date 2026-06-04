import { Receipt, TrendingUp, Clock, Sparkles } from 'lucide-react';
import { denyDevelopers } from '@/lib/guards';
import Link from 'next/link';

import '@/app/contact-detail.css';
import '@/app/payment-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { PaymentFilters } from '@/components/payments/PaymentFilters';
import { PaymentsTable } from '@/components/payments/PaymentsTable';
import { CreatePaymentDialog } from '@/components/payments/CreatePaymentDialog';
import { listPayments, listDealOptions } from '@/lib/actions/payments';
import { getCurrentUserRole } from '@/lib/auth';
import { formatMoneyCompact, formatDate } from '@/lib/ui-payments';
import type { PaymentRow } from '@/lib/types-payments';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  deal?: string;
  search?: string;
};

// Statuses that count as money IN HAND (received) vs still OUTSTANDING.
const RECEIVED_STATUSES = new Set(['received', 'confirmed', 'in_team_accounts']);
const OUTSTANDING_STATUSES = new Set(['due', 'overdue', 'client_paid']);

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

// /payments — list (Payments.html: money-forward). Server Component. Reads filters
// from searchParams, fetches via listPayments (RLS-gated through asUser). Row
// projection per role: admin/pm/finance → all; sales → their owned deals'
// payments; developer → ZERO (no payments_select policy — the total dev wall).
//
// The aggregate Received / Outstanding metric cards + the overdue AI strip are
// computed from ONLY the rows the viewer can actually see (so a developer's
// totals are ₹0 / nothing — the wall holds in the aggregates too).
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await denyDevelopers();
  const sp = await searchParams;

  const filters = {
    status: sp.status || undefined,
    deal: sp.deal || undefined,
    search: sp.search || undefined,
  };

  const [payments, deals, role] = await Promise.all([
    listPayments(filters) as Promise<PaymentRow[]>,
    listDealOptions(),
    getCurrentUserRole(),
  ]);

  const dealOptions = deals.map((d) => ({
    id: d.id,
    label: `${d.name} (${d.display_id})`,
  }));

  // Aggregates from the visible rows. Pick the most common currency for the
  // compact display (payments can be mixed-currency; we don't FX-convert).
  const currencyCount = new Map<string, number>();
  for (const p of payments) {
    const c = (p.currency ?? 'USD').toUpperCase();
    currencyCount.set(c, (currencyCount.get(c) ?? 0) + 1);
  }
  let displayCurrency = 'USD';
  let max = -1;
  for (const [c, n] of currencyCount) {
    if (n > max) {
      max = n;
      displayCurrency = c;
    }
  }

  let received = 0;
  let outstanding = 0;
  let overdueCount = 0;
  let overdueExample: PaymentRow | null = null;
  for (const p of payments) {
    const amt = toNum(p.amount);
    if (RECEIVED_STATUSES.has(p.status)) received += amt;
    else if (OUTSTANDING_STATUSES.has(p.status)) outstanding += amt;
    if (p.status === 'overdue') {
      overdueCount += 1;
      if (!overdueExample) overdueExample = p;
    }
  }

  const total = payments.length;
  const sub = `${total} ${total === 1 ? 'payment' : 'payments'} · ${displayCurrency}`;

  return (
    <AppShell title="Payments">
      <div className="page-h">
        <div>
          <h1>Payments</h1>
          <div className="sub">{sub}</div>
        </div>
        <div className="spacer" />
        <CreatePaymentDialog deals={deals} role={role} />
      </div>

      {/* Aggregate Received vs Outstanding metric cards (Payments.html .sumcards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            padding: '16px 20px',
          }}
        >
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
              background: 'var(--color-success-bg)',
            }}
          >
            <TrendingUp size={20} style={{ color: 'var(--color-success-solid)' }} aria-hidden />
          </span>
          <div>
            <div className="amount-due-k">Received</div>
            <div className="amount-due-v" style={{ color: 'var(--color-success-text)', margin: '2px 0 0' }}>
              {formatMoneyCompact(received, displayCurrency)}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
            confirmed +<br />in accounts
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            padding: '16px 20px',
          }}
        >
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
              background: 'var(--color-warning-bg)',
            }}
          >
            <Clock size={20} style={{ color: 'var(--color-warning-solid)' }} aria-hidden />
          </span>
          <div>
            <div className="amount-due-k">Outstanding</div>
            <div className="amount-due-v" style={{ color: 'var(--color-warning-text)', margin: '2px 0 0' }}>
              {formatMoneyCompact(outstanding, displayCurrency)}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
            due +<br />
            {overdueCount > 0 ? (
              <span style={{ color: 'var(--color-danger-text)' }}>
                {overdueCount} overdue
              </span>
            ) : (
              <span>none overdue</span>
            )}
          </div>
        </div>
      </div>

      {/* Overdue AI strip — only when there is a real overdue payment to chase. */}
      {overdueExample && (
        <div className="ai-strip">
          <span className="mk">
            <Sparkles size={15} style={{ color: 'var(--color-accent)' }} aria-hidden />
          </span>
          <p>
            <b>{overdueExample.display_id} is overdue</b>
            {overdueExample.deal_name ? ` on ${overdueExample.deal_name}` : ''} — a gentle chase keeps
            cash flow healthy.{' '}
            <Link href={`/payments/${overdueExample.id}`}>Open {overdueExample.display_id} →</Link>
          </p>
        </div>
      )}

      <PaymentFilters deals={dealOptions} />

      {payments.length === 0 ? (
        <div className="tbl-wrap">
          <div data-testid="payments-empty" className="empty">
            <span className="ic" style={{ background: 'var(--color-accent-subtle)' }}>
              <Receipt size={26} aria-hidden style={{ color: 'var(--color-accent)' }} />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15 }}>No payments match these filters</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', maxWidth: 340 }}>
              Try clearing a filter, or record a payment against a deal.
            </div>
          </div>
        </div>
      ) : (
        <PaymentsTable payments={payments} />
      )}
    </AppShell>
  );
}
