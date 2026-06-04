import { notFound } from 'next/navigation';
import { denyDevelopers } from '@/lib/guards';
import Link from 'next/link';
import {
  Pencil,
  Plus,
  Flag,
  Kanban,
  Handshake,
  Sparkles,
  TrendingUp,
  Info,
  TriangleAlert,
  Clock,
  FilePlus,
  Send,
  Shield,
} from 'lucide-react';

import '@/app/contact-detail.css';
import '@/app/payment-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { PaymentStatusPill } from '@/components/payments/PaymentStatusPill';
import { LifecycleRail } from '@/components/payments/LifecycleRail';
import { ConfirmButton } from '@/components/payments/ConfirmButton';
import { StatusControl } from '@/components/payments/StatusControl';
import { RevealAttachment } from '@/components/payments/RevealAttachment';
import { ArchiveMenu } from '@/components/payments/ArchiveMenu';
import { NotesCard } from '@/components/cards/NotesCard';
import { ConversationCard } from '@/components/cards/ConversationCard';
import {
  PaymentDetailInlineText,
  PaymentDetailInlineTextarea,
  PaymentDetailInlineSelect,
} from '@/components/payments/PaymentDetailInlineField';

import { getPayment } from '@/lib/actions/payments';
import { listAttachments, listAiInsights } from '@/lib/actions/polymorphic';
import { getCurrentUserRole } from '@/lib/auth';

import {
  formatMoney,
  formatMoneyCompact,
  formatPct,
  formatDate,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABEL,
  PAYMENT_STATUS_LABEL,
} from '@/lib/ui-payments';
import { formatDate as formatLongDate, formatDateTime } from '@/lib/ui';

import type {
  PaymentRow,
  PaymentBilling,
  PaymentDeal,
  PaymentContextRef,
} from '@/lib/types-payments';
import type { AttachmentRow, AiInsightRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SENTIMENT_ICON = {
  positive: { Icon: TrendingUp, color: 'var(--color-ai-positive)' },
  neutral: { Icon: Info, color: 'var(--color-ai-neutral)' },
  risk: { Icon: TriangleAlert, color: 'var(--color-ai-risk)' },
} as const;

// /payments/[id] — the Payment Detail cockpit (Payment Detail.html). Server
// Component; every read is RLS-gated via getPayment. Developers are walled:
// getPayment returns null → notFound() (indistinguishable from not-found). Sales
// on a deal they don't own are likewise walled.
//
// 🚨 The finance-gated confirm is PRESERVED end-to-end:
//   - canConfirm = admin/finance (the WITH CHECK roles) → ConfirmButton renders.
//   - forceVisible (pm) renders the button so the DB refusal surfaces through the
//     real app path (the PM-cannot-confirm keystone test).
//   - The status pill's confirm-gated items are disabled for non-finance; the DB
//     WITH CHECK is the actual boundary regardless.
//   - Status is NOT a free inline field — it lives only on the gated pill / confirm
//     / status-control surfaces.
export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await denyDevelopers();
  const { id } = await params;

  const [result, role] = await Promise.all([getPayment(id), getCurrentUserRole()]);
  if (!result) notFound(); // not found OR RLS-denied — indistinguishable, by design

  const payment = result.payment as PaymentRow;
  const billing = result.billing as PaymentBilling | null;
  const deal = result.deal as PaymentDeal | null;
  const milestone = result.milestone as PaymentContextRef | null;
  const project = result.project as PaymentContextRef | null;

  // Fan out the polymorphic cockpit reads (RLS-gated).
  const [attachments, insights] = await Promise.all([
    listAttachments('payment', payment.id) as Promise<AttachmentRow[]>,
    listAiInsights('payment', payment.id) as Promise<AiInsightRow[]>,
  ]);

  // The finance-only confirm gate. canConfirm = admin/finance (the WITH CHECK
  // roles). A PM is shown the button (forceVisible) so the refusal can surface
  // through the real app path — but the DB WITH CHECK is the actual boundary.
  const canConfirm = role === 'admin' || role === 'finance';
  const forceVisible = role === 'pm';
  // Roles that pass payments_update USING (admin/pm/finance) get the non-confirm
  // status control (the reset-to-'due' path). The DB still gates each transition.
  const canTransition = role === 'admin' || role === 'pm' || role === 'finance';

  const status = payment.status;
  const isOverdue = status === 'overdue';
  const settled = status === 'confirmed' || status === 'in_team_accounts';

  // against-tag: a payment hangs off a deal, optionally a milestone / project. We
  // prefer the most specific context (milestone > project > deal) for the chip.
  const against = milestone
    ? { Icon: Flag, label: `${milestone.display_id} · ${milestone.name}`, href: null }
    : project
      ? { Icon: Kanban, label: project.name, href: `/projects/${project.id}` }
      : deal
        ? { Icon: Handshake, label: deal.name, href: `/deals/${deal.id}` }
        : null;

  const paymentTypeOptions = PAYMENT_TYPES.map((p) => ({
    value: p,
    label: PAYMENT_TYPE_LABEL[p] ?? p,
  }));

  const currency = payment.currency ?? billing?.currency ?? null;
  const outstanding = billing?.outstanding ?? null;

  return (
    <AppShell title="Payment">
      <div data-testid="payment-detail">
        {/* HEADER — money hero + display_id + finance-gated status pill + against */}
        <div className="detail-head">
          <div className="dh-main">
            <div className="dh-title-row">
              <span className="pay-amount">{formatMoney(payment.amount, currency)}</span>
              <PaymentStatusPill
                paymentId={payment.id}
                status={status}
                canConfirm={canConfirm}
              />
            </div>
            <div className="dh-sub">
              <span className="mono" style={{ fontFamily: 'var(--font-mono)' }}>
                {payment.display_id}
              </span>
              {deal ? (
                <>
                  {' · for '}
                  <Link href={`/deals/${deal.id}`}>{deal.name}</Link>
                </>
              ) : null}
              {' · '}Created {formatLongDate(toISO(payment.created_at))} · Updated{' '}
              {formatDateTime(toISO(payment.updated_at))}
            </div>
          </div>
          <div className="spacer" />
          <button type="button" className="btn btn-secondary">
            <Pencil size={16} />
            Edit
          </button>
          <button type="button" className="btn btn-primary">
            <Plus size={16} />
            Create
          </button>
          <ArchiveMenu paymentId={payment.id} />
        </div>

        <div className="dgrid">
          {/* LEFT — payment meta (inline-edit) + reveal-logged attachments */}
          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h3>Payment details</h3>
              </div>
              <div className="card-b" style={{ paddingTop: 8 }}>
                <div className="meta-row">
                  <span className="k">Payment ID</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {payment.display_id}
                  </span>
                </div>

                <PaymentDetailInlineText
                  paymentId={payment.id}
                  field="amount"
                  label="Amount"
                  value={payment.amount}
                  mono
                  numeric
                />
                <PaymentDetailInlineText
                  paymentId={payment.id}
                  field="currency"
                  label="Currency"
                  value={payment.currency}
                  mono
                />

                <div className="meta-row">
                  <span className="k">Against</span>
                  <div className="ie" data-ie="static">
                    {against ? (
                      against.href ? (
                        <Link href={against.href} className="against">
                          <against.Icon size={11} aria-hidden />
                          {against.label}
                        </Link>
                      ) : (
                        <span className="against">
                          <against.Icon size={11} aria-hidden />
                          {against.label}
                        </span>
                      )
                    ) : (
                      <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>—</span>
                    )}
                  </div>
                </div>

                <PaymentDetailInlineSelect
                  paymentId={payment.id}
                  field="payment_type"
                  label="Payment type"
                  value={payment.payment_type}
                  options={paymentTypeOptions}
                  allowEmpty
                />
                <PaymentDetailInlineText
                  paymentId={payment.id}
                  field="payment_date"
                  label="Payment date"
                  value={payment.payment_date}
                  mono
                  type="date"
                />
                <PaymentDetailInlineText
                  paymentId={payment.id}
                  field="transaction_ref"
                  label="Transaction no."
                  value={payment.transaction_ref}
                  mono
                />
                <PaymentDetailInlineTextarea
                  paymentId={payment.id}
                  field="note"
                  label="Note"
                  value={payment.note}
                />
              </div>
            </div>

            {/* Reveal-logged invoice / proof-of-payment attachments. */}
            <RevealAttachment attachments={attachments} />
          </div>

          {/* CENTER — lifecycle rail + finance-gated confirm */}
          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h3>Lifecycle</h3>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  draft → sent → paid → confirmed
                </span>
              </div>
              <div className="card-b" style={{ padding: '22px 20px' }}>
                <LifecycleRail status={status} />

                {/* The finance-gated confirm gate (the keystone). */}
                <ConfirmButton
                  paymentId={payment.id}
                  status={status}
                  canConfirm={canConfirm}
                  forceVisible={forceVisible}
                />

                {canTransition && (
                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: '1px solid var(--color-border-subtle)',
                      maxWidth: 280,
                    }}
                  >
                    <StatusControl paymentId={payment.id} status={status} />
                  </div>
                )}
              </div>
            </div>

            {/* Billing context — read-only computed from v_deal_billing. */}
            <div className="card" data-testid="card-billing">
              <div className="card-h">
                <h3>Deal billing</h3>
                {deal ? (
                  <Link href={`/deals/${deal.id}`} className="more more-link">
                    Open deal
                  </Link>
                ) : null}
              </div>
              <div className="card-b">
                <div className="statstrip" style={{ boxShadow: 'none', border: 0, padding: '4px 0' }}>
                  <div className="stat">
                    <div className="k">Agreed</div>
                    <div className="v">{formatMoney(billing?.agreed, currency)}</div>
                  </div>
                  <div className="stat">
                    <div className="k">Received</div>
                    <div className="v" style={{ color: 'var(--color-success-text)' }}>
                      {formatMoney(billing?.received, currency)}
                    </div>
                    <div className="s">{formatPct(billing?.pct_collected)} collected</div>
                  </div>
                  <div className="stat">
                    <div className="k">Outstanding</div>
                    <div className="v" style={{ color: 'var(--color-warning-text)' }}>
                      {formatMoney(billing?.outstanding, currency)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — amount due, AI supervisor, activity (created/confirmed-by) */}
          <div className="stack">
            <div
              className="card"
              style={isOverdue ? { borderColor: 'var(--color-danger-border)' } : undefined}
            >
              <div className="card-b">
                <div className="amount-due-k">{settled ? 'Amount received' : 'Amount due'}</div>
                <div className="amount-due-v">
                  {formatMoneyCompact(
                    settled ? payment.amount : outstanding ?? payment.amount,
                    currency,
                  )}
                </div>
                {settled ? (
                  <span
                    className="schedule"
                    style={{
                      background: 'var(--color-success-bg)',
                      color: 'var(--color-success-text)',
                      border: '1px solid var(--color-success-border)',
                    }}
                  >
                    {PAYMENT_STATUS_LABEL[status]}
                  </span>
                ) : (
                  <span
                    className="schedule"
                    style={{
                      background: isOverdue ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                      color: isOverdue ? 'var(--color-danger-text)' : 'var(--color-warning-text)',
                      border: `1px solid ${
                        isOverdue ? 'var(--color-danger-border)' : 'var(--color-warning-border)'
                      }`,
                    }}
                  >
                    <Clock size={12} aria-hidden />
                    {isOverdue ? 'Overdue' : 'Awaiting payment'}
                  </span>
                )}
              </div>
            </div>

            {/* AI Supervisor */}
            <div className="card ai-card" data-testid="card-ai-insights">
              <div className="card-h" style={{ borderBottom: 0, paddingBottom: 4 }}>
                <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
                <h3>AI Supervisor</h3>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)' }}>
                  on this payment
                </span>
              </div>
              <div
                className="card-b"
                style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {insights.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No insights yet</p>
                ) : (
                  insights.map((i) => {
                    const meta = i.sentiment
                      ? SENTIMENT_ICON[i.sentiment as keyof typeof SENTIMENT_ICON]
                      : null;
                    const Icon = meta?.Icon ?? Info;
                    const color = meta?.color ?? 'var(--color-ai-neutral)';
                    return (
                      <div className="insight" key={i.id}>
                        <Icon size={16} style={{ color }} />
                        <p>{i.body}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Activity — created_by / confirmed_by (finance-gated). */}
            <div className="card" data-testid="card-activity">
              <div className="card-h">
                <h3>Activity</h3>
              </div>
              <div className="card-b">
                <div className="act-row">
                  <FilePlus size={16} style={{ color: 'var(--color-text-tertiary)' }} aria-hidden />
                  <div className="at">
                    <div>
                      Created by{' '}
                      <b>{payment.created_by_name ?? 'Unknown'}</b>
                    </div>
                    <div className="when">{formatLongDate(toISO(payment.created_at))}</div>
                  </div>
                </div>
                <div className="act-row">
                  <Send size={16} style={{ color: 'var(--color-text-tertiary)' }} aria-hidden />
                  <div className="at">
                    <div>Last updated</div>
                    <div className="when">{formatDateTime(toISO(payment.updated_at))}</div>
                  </div>
                </div>
                <div className="act-row">
                  <Shield
                    size={16}
                    style={{
                      color: payment.confirmed_by_name
                        ? 'var(--color-success-solid)'
                        : 'var(--color-text-muted)',
                    }}
                    aria-hidden
                  />
                  <div className="at">
                    {payment.confirmed_by_name ? (
                      <div>
                        Confirmed by <b>{payment.confirmed_by_name}</b>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--color-text-tertiary)' }}>
                        Confirmed by — <span style={{ fontStyle: 'italic' }}>not yet confirmed</span>
                      </div>
                    )}
                    <div className="when">finance-gated</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Universal polymorphic cards — parent_type='payment'. Notes +
                conversation complete the module-contract (card-notes /
                card-conversation testids); attachments + ai-insights are the
                cockpit-styled cards above. */}
            <NotesCard parentType="payment" parentId={payment.id} />
            <ConversationCard parentType="payment" parentId={payment.id} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// The neon driver returns timestamptz as Date objects; coerce to an ISO string so
// the shared lib/ui formatters (which expect string | null) never receive a raw
// Date. Date-safe: never renders a raw Date, never .slice()s a Date.
function toISO(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}
