import { notFound } from 'next/navigation';
import { denyDevelopers } from '@/lib/guards';
import Link from 'next/link';
import {
  Sparkles,
  TrendingUp,
  Info,
  TriangleAlert,
  FileText,
  Link2,
  ExternalLink,
  Download,
  CreditCard,
  User,
  Building2,
  Pencil,
  Plus,
} from 'lucide-react';

import '@/app/contact-detail.css';
import '@/app/deal-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import { DealHeaderName } from '@/components/deals/DealHeaderName';
import { DealStagePillEditor } from '@/components/deals/DealStagePillEditor';
import { DealInlineText, DealInlineSelect } from '@/components/deals/DealInlineField';
import { DealOwnersEditor } from '@/components/deals/DealOwnersEditor';
import { DealTagsEditor } from '@/components/deals/DealTagsEditor';
import { DealConversation } from '@/components/deals/DealConversation';
import { ConvertToProject } from '@/components/deals/ConvertToProject';
import { DealNotesAdd } from '@/components/deals/DealNotesAdd';
import { DealAttachmentsAdd } from '@/components/deals/DealAttachmentsAdd';

import {
  getDeal,
  listDealProjects,
  listDealPayments,
} from '@/lib/actions/deals';
import {
  listConversation,
  listNotes,
  listAttachments,
  listAiInsights,
} from '@/lib/actions/polymorphic';
import { listActiveUsers } from '@/lib/actions/directory';

import {
  DEAL_STAGE_LABEL,
  DEAL_STAGE_DOT,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABEL,
  formatMoney,
  formatMoneyCompact,
  formatPct,
  stageProbability,
  isWonStage,
} from '@/lib/ui-deals';
import { PROJECT_STATUS_LABEL } from '@/lib/ui-projects';
import { PAYMENT_STATUS_LABEL, formatDate as formatPayDate } from '@/lib/ui-payments';
import { formatDate, formatDateTime, avatarBg, initials } from '@/lib/ui';

import type {
  DealRollup,
  DealBilling,
  DealOwner,
  DealTag,
  DealContact,
  DealCompany,
  DealProjectRow,
  DealPaymentRow,
} from '@/lib/types-deals';
import type {
  ConversationRow,
  NoteRow,
  AttachmentRow,
  AiInsightRow,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const SENTIMENT_ICON = {
  positive: { Icon: TrendingUp, color: 'var(--color-ai-positive)' },
  neutral: { Icon: Info, color: 'var(--color-ai-neutral)' },
  risk: { Icon: TriangleAlert, color: 'var(--color-ai-risk)' },
} as const;

// /deals/[id] — the three-column deal cockpit. Server Component; every read is
// RLS-gated via the server actions. Deals are a TOTAL developer wall: getDeal
// returns null for developers → notFound() (indistinguishable from not-found).
export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await denyDevelopers();
  const { id } = await params;

  const result = await getDeal(id);
  if (!result) notFound(); // not found OR RLS-denied — indistinguishable, by design

  const deal = result.deal as DealRollup;
  const billing = result.billing as DealBilling | null;
  const owners = result.owners as DealOwner[];
  const tags = result.tags as DealTag[];
  const contact = result.contact as DealContact | null;
  const company = result.company as DealCompany | null;

  const [users, conversation, notes, attachments, insights, projects, payments] =
    await Promise.all([
      listActiveUsers(),
      listConversation('deal', deal.id) as Promise<ConversationRow[]>,
      listNotes('deal', deal.id) as Promise<NoteRow[]>,
      listAttachments('deal', deal.id) as Promise<AttachmentRow[]>,
      listAiInsights('deal', deal.id) as Promise<AiInsightRow[]>,
      listDealProjects(deal.id) as Promise<DealProjectRow[]>,
      listDealPayments(deal.id) as Promise<DealPaymentRow[]>,
    ]);

  const prob = stageProbability(deal.stage);
  const won = isWonStage(deal.stage);

  const received = billing?.received ?? deal.received ?? null;
  const outstanding = billing?.outstanding ?? deal.outstanding ?? null;
  const pct = billing?.pct_collected ?? deal.pct_collected ?? null;
  const currency = deal.currency ?? billing?.currency ?? null;

  const paymentTypeOptions = PAYMENT_TYPES.map((p) => ({
    value: p,
    label: PAYMENT_TYPE_LABEL[p] ?? p,
  }));

  const linkCount = attachments.filter((a) => a.kind === 'link').length;
  const fileCount = attachments.length - linkCount;

  return (
    <AppShell title="Deal">
      <div data-testid="deal-detail">
        {/* HEADER */}
        <div className="detail-head">
          <div className="dh-main">
            <div className="dh-title-row">
              {/* Inline-editable NAME (Playwright edits this) */}
              <div data-testid="deal-field-name" className="dh-name">
                <DealHeaderName dealId={deal.id} value={deal.name} />
              </div>
              <DealStagePillEditor dealId={deal.id} stage={deal.stage} />
            </div>
            <div className="dh-sub">
              <span className="mono" style={{ fontFamily: 'var(--font-mono)' }}>
                {deal.display_id}
              </span>
              {contact ? (
                <>
                  {' · '}
                  <Link href={`/contacts/${contact.id}`}>{contact.full_name}</Link>
                </>
              ) : null}
              {company ? (
                <>
                  {' · '}
                  <Link href={`/companies/${company.id}`}>{company.name}</Link>
                </>
              ) : null}
              {' · '}Created {formatDate(deal.created_at)} · Updated{' '}
              {formatDateTime(deal.updated_at)}
            </div>
          </div>
          <div className="spacer" />
          <div className="dh-ltv">
            <div className="k">Deal value</div>
            <div className="v">{formatMoneyCompact(deal.deal_value, currency)}</div>
          </div>
          <button type="button" className="btn btn-secondary">
            <Pencil size={16} />
            Edit
          </button>
          <button type="button" className="btn btn-primary">
            <Plus size={16} />
            Create
          </button>
        </div>

        {/* STAT STRIP */}
        <div className="statstrip" style={{ marginBottom: 18 }} data-testid="card-billing">
          <div className="stat">
            <div className="k">Deal value</div>
            <div className="v">{formatMoney(deal.deal_value, currency)}</div>
          </div>
          <div className="stat">
            <div className="k">Received</div>
            <div className="v" style={{ color: 'var(--color-success-text)' }}>
              {formatMoney(received, currency)}
            </div>
            <div className="s">{formatPct(pct)} collected</div>
          </div>
          <div className="stat">
            <div className="k">Outstanding</div>
            <div className="v" style={{ color: 'var(--color-warning-text)' }}>
              {formatMoney(outstanding, currency)}
            </div>
          </div>
          <div className="stat">
            <div className="k">Probability</div>
            <div className="v">{prob}%</div>
            <div className="s">{DEAL_STAGE_LABEL[deal.stage] ?? deal.stage}</div>
          </div>
          <div className="stat">
            <div className="k">Owners</div>
            {owners.length === 0 ? (
              <div className="s" style={{ marginTop: 6 }}>
                Unassigned
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                <div className="ostack">
                  {owners.map((o) => (
                    <span key={o.user_id} className="wrap" title={o.full_name ?? undefined}>
                      <span className="avatar" style={{ background: avatarBg(o.user_id) }}>
                        {initials(o.full_name ?? o.email)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="dgrid">
          {/* LEFT — deal details + attachments */}
          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h3>Deal details</h3>
              </div>
              <div className="card-b" style={{ paddingTop: 8 }}>
                <div className="meta-row">
                  <span className="k">Deal ID</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {deal.display_id}
                  </span>
                </div>

                <DealInlineText
                  dealId={deal.id}
                  field="deal_value"
                  label="Value"
                  value={deal.deal_value == null ? null : String(deal.deal_value)}
                  mono
                  numeric
                />
                <DealInlineText
                  dealId={deal.id}
                  field="currency"
                  label="Currency"
                  value={deal.currency}
                  mono
                />

                <div className="meta-row">
                  <span className="k">Stage</span>
                  <div className="ie" data-ie="static">
                    <span className="status">
                      <span
                        className="dot"
                        style={{ background: DEAL_STAGE_DOT[deal.stage] ?? 'var(--n-400)' }}
                      />
                      {DEAL_STAGE_LABEL[deal.stage] ?? deal.stage}
                    </span>
                  </div>
                </div>

                <DealInlineSelect
                  dealId={deal.id}
                  field="payment_type"
                  label="Payment type"
                  value={deal.payment_type}
                  options={paymentTypeOptions}
                  allowEmpty
                />
                <DealInlineText
                  dealId={deal.id}
                  field="close_date"
                  label="Expected close"
                  value={deal.close_date}
                  mono
                  type="date"
                />

                <div className="meta-row">
                  <span className="k">Probability</span>
                  <div className="ie" data-ie="static">
                    <span style={{ fontSize: 14 }}>{prob}%</span>
                  </div>
                </div>

                <div className="meta-row">
                  <span className="k">Contact</span>
                  <div className="ie" data-ie="static">
                    {contact ? (
                      <Link href={`/contacts/${contact.id}`} style={{ fontSize: 14 }}>
                        {contact.full_name}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>—</span>
                    )}
                  </div>
                </div>
                <div className="meta-row">
                  <span className="k">Company</span>
                  <div className="ie" data-ie="static">
                    {company ? (
                      <Link href={`/companies/${company.id}`} style={{ fontSize: 14 }}>
                        {company.name}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>—</span>
                    )}
                  </div>
                </div>

                <DealOwnersEditor dealId={deal.id} owners={owners} userOptions={users} />
                <DealTagsEditor dealId={deal.id} tags={tags} />

                <DealInlineText
                  dealId={deal.id}
                  field="description"
                  label="Description"
                  value={deal.description}
                />
              </div>
            </div>

            {/* Attachments */}
            <div className="card" data-testid="card-attachments">
              <div className="card-h">
                <h3>Attachments</h3>
                {fileCount > 0 && (
                  <span className="cnt">
                    {fileCount} {fileCount === 1 ? 'file' : 'files'}
                  </span>
                )}
                {linkCount > 0 && (
                  <span className="cnt">
                    {linkCount} {linkCount === 1 ? 'link' : 'links'}
                  </span>
                )}
              </div>
              <div className="card-b" style={{ padding: 6 }}>
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sum"
                    style={{ padding: 8, borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}
                  >
                    {a.kind === 'link' ? (
                      <Link2 size={18} style={{ color: 'var(--color-accent)' }} />
                    ) : (
                      <FileText size={18} style={{ color: 'var(--color-danger-fg)' }} />
                    )}
                    <div className="t">
                      <div className="l1">{a.title}</div>
                      <div className="l2 mono" style={{ fontFamily: 'var(--font-mono)' }}>
                        {a.kind === 'link' ? a.url : a.mime_type ?? 'file'}
                      </div>
                    </div>
                    {a.kind === 'link' ? (
                      <ExternalLink size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    ) : (
                      <Download size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    )}
                  </a>
                ))}
                <DealAttachmentsAdd dealId={deal.id} />
              </div>
            </div>
          </div>

          {/* CENTER — negotiation history */}
          <DealConversation
            dealId={deal.id}
            contactName={contact?.full_name ?? null}
            entries={conversation}
          />

          {/* RIGHT — convert · AI · contact/company · projects · payments · notes */}
          <div className="stack">
            <ConvertToProject dealId={deal.id} isWon={won} projects={projects} />

            {/* AI Supervisor */}
            <div className="card ai-card" data-testid="card-ai-insights">
              <div className="card-h" style={{ borderBottom: 0, paddingBottom: 4 }}>
                <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
                <h3>AI Supervisor</h3>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)' }}>
                  on this deal
                </span>
              </div>
              <div
                className="card-b"
                style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {insights.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
                    No insights yet
                  </p>
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

            {/* Linked contact & company */}
            <div className="card">
              <div className="card-h">
                <h3>Linked</h3>
              </div>
              <div className="card-b" style={{ padding: '6px 14px' }}>
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} className="sum" style={{ textDecoration: 'none' }}>
                    <User size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    <div className="t">
                      <div className="l1">{contact.full_name}</div>
                      <div className="l2">Contact</div>
                    </div>
                  </Link>
                ) : null}
                {company ? (
                  <Link href={`/companies/${company.id}`} className="sum" style={{ textDecoration: 'none' }}>
                    <Building2 size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    <div className="t">
                      <div className="l1">{company.name}</div>
                      <div className="l2">Company</div>
                    </div>
                  </Link>
                ) : null}
                {!contact && !company && (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                    No linked records.
                  </p>
                )}
              </div>
            </div>

            {/* Related projects */}
            <div className="card">
              <div className="card-h">
                <h3>Projects</h3>
                <span className="cnt">{projects.length} total</span>
                <Link href="/projects" className="more more-link">
                  View all
                </Link>
              </div>
              <div className="card-b" style={{ padding: '6px 14px' }}>
                {projects.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No projects.</p>
                ) : (
                  projects.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`} className="sum" style={{ textDecoration: 'none' }}>
                      <div className="t">
                        <div className="l1">{p.name}</div>
                        <div className="l2 mono" style={{ fontFamily: 'var(--font-mono)' }}>
                          {p.display_id}
                        </div>
                      </div>
                      <span className="status">{PROJECT_STATUS_LABEL[p.status] ?? p.status}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Payments */}
            <div className="card" data-testid="card-payments">
              <div className="card-h">
                <h3>Payments</h3>
                <span className="cnt">{payments.length}</span>
                <Link href="/payments" className="more more-link">
                  View all
                </Link>
              </div>
              <div className="card-b" style={{ padding: '6px 14px' }}>
                {payments.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No payments.</p>
                ) : (
                  payments.map((p) => (
                    <div key={p.id} className="sum">
                      <CreditCard size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                      <div className="t">
                        <div className="l1 pay-amt">{formatMoney(p.amount, p.currency)}</div>
                        <div className="l2 mono" style={{ fontFamily: 'var(--font-mono)' }}>
                          {p.display_id}
                          {p.payment_date ? ` · ${formatPayDate(p.payment_date)}` : ''}
                        </div>
                      </div>
                      <span className="status">{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="card" data-testid="card-notes">
              <div className="card-h">
                <h3>Notes</h3>
                <span className="cnt">{notes.length}</span>
                <span className="more">
                  <DealNotesAdd dealId={deal.id} />
                </span>
              </div>
              <div className="card-b">
                {notes.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No notes yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        style={{ borderLeft: '2px solid var(--color-accent-border)', paddingLeft: 12 }}
                      >
                        {n.title && (
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{n.title}</div>
                        )}
                        <div
                          style={{
                            fontSize: 12.5,
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {n.body}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                          {n.author_name ?? 'Unknown'} · {formatDate(n.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
