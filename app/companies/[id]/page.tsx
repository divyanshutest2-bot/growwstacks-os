import { notFound } from 'next/navigation';
import { denyDevelopers } from '@/lib/guards';
import Link from 'next/link';
import {
  Kanban,
  Handshake,
  Sparkles,
  TrendingUp,
  Info,
  TriangleAlert,
  FileText,
  Download,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
} from 'lucide-react';

import '@/app/contact-detail.css';
import '@/app/company-detail.css';

import { AppShell } from '@/components/shell/AppShell';
import {
  CompanyDetailInlineText,
  CompanyDetailInlineSelect,
} from '@/components/companies/CompanyDetailInlineField';
import { CompanyHeaderName } from '@/components/companies/CompanyHeaderName';
import { CompanyTypePillEditor } from '@/components/companies/CompanyTypePillEditor';
import { CompanyLocationField } from '@/components/companies/CompanyLocationField';
import { CompanyOwnerEditor } from '@/components/companies/CompanyOwnerEditor';
import { CompanyCredentialsReveal } from '@/components/companies/CompanyCredentialsReveal';
import { CompanyConversationThread } from '@/components/companies/CompanyConversationThread';
import { CompanyNotesAdd } from '@/components/companies/CompanyNotesAdd';
import { CompanyAttachmentsAdd } from '@/components/companies/CompanyAttachmentsAdd';
import { PeoplePanel } from '@/components/companies/PeoplePanel';

import {
  getCompany,
  listCompanyContacts,
  listCompanyProjects,
  listCompanyDeals,
  listCompanyTasks,
  listCompanyCredentials,
} from '@/lib/actions/companies';
import {
  listConversation,
  listNotes,
  listAttachments,
  listAiInsights,
} from '@/lib/actions/polymorphic';
import { listActiveUsers } from '@/lib/actions/directory';

import {
  COMPANY_SIZES,
  avatarBg,
  initials,
  formatINRLakhs,
  formatDate,
  formatDateTime,
} from '@/lib/ui';
import { PROJECT_STATUS_LABEL } from '@/lib/ui-projects';
import { TASK_STATUS_LABEL } from '@/lib/ui-tasks';
import { DEAL_STAGE_LABEL, formatMoney } from '@/lib/ui-deals';

import type {
  CompanyRollup,
  ConversationRow,
  NoteRow,
  AttachmentRow,
  AiInsightRow,
  CompanyContactRow,
  CompanyProjectRow,
  CompanyDealRow,
  CompanyTaskRow,
  CompanyCredentialRow,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

// Sentiment → icon + color var for the AI Supervisor card.
const SENTIMENT_ICON = {
  positive: { Icon: TrendingUp, color: 'var(--color-ai-positive)' },
  neutral: { Icon: Info, color: 'var(--color-ai-neutral)' },
  risk: { Icon: TriangleAlert, color: 'var(--color-ai-risk)' },
} as const;

function pctNum(value: string | number | null): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

// /companies/[id] — the three-column company cockpit (Company Detail.html). The
// People panel is the center-of-gravity. Server Component; every read is RLS-
// gated via the server actions. Developers are walled (getCompany → null →
// notFound) — companies has no developer SELECT policy.
export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await denyDevelopers();
  const { id } = await params;

  const result = await getCompany(id);
  if (!result) notFound(); // not found OR RLS-denied — indistinguishable, by design

  const company = result.company as CompanyRollup;

  // Fan out the rest of the cockpit reads (all RLS-gated).
  const [
    users,
    contacts,
    conversation,
    notes,
    attachments,
    insights,
    projects,
    deals,
    tasks,
    credentials,
  ] = await Promise.all([
    listActiveUsers(),
    listCompanyContacts(company.id) as Promise<CompanyContactRow[]>,
    listConversation('company', company.id) as Promise<ConversationRow[]>,
    listNotes('company', company.id) as Promise<NoteRow[]>,
    listAttachments('company', company.id) as Promise<AttachmentRow[]>,
    listAiInsights('company', company.id) as Promise<AiInsightRow[]>,
    listCompanyProjects(company.id) as Promise<CompanyProjectRow[]>,
    listCompanyDeals(company.id) as Promise<CompanyDealRow[]>,
    listCompanyTasks(company.id) as Promise<CompanyTaskRow[]>,
    listCompanyCredentials(company.id) as Promise<CompanyCredentialRow[]>,
  ]);

  const firstName = company.name?.trim().split(/\s+/)[0] ?? company.name;

  const sizeOptions = COMPANY_SIZES.map((s) => ({ value: s, label: s }));

  const linkCount = attachments.filter((a) => a.kind === 'link').length;
  const fileCount = attachments.length - linkCount;

  const activeProjects = company.active_projects ?? 0;
  const totalProjects = company.total_projects ?? 0;

  return (
    <AppShell title="Company">
      <div data-testid="company-detail">
        {/* HEADER */}
        <div className="detail-head">
          <span className="clogo" style={{ background: avatarBg(company.id) }}>
            {initials(company.name)}
          </span>
          <div className="dh-main">
            <div className="dh-title-row">
              {/* Inline-editable NAME (Playwright edits this) */}
              <div data-testid="company-field-name" className="dh-name">
                <CompanyHeaderName companyId={company.id} value={company.name} />
              </div>
              <CompanyTypePillEditor companyId={company.id} type={company.type} />
            </div>
            <div className="dh-sub">
              {company.industry ? <>{company.industry} · </> : null}
              {company.website ? (
                <>
                  <a
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {company.website}
                  </a>
                  {' · '}
                </>
              ) : null}
              Created {formatDate(company.created_at)} · Updated {formatDateTime(company.updated_at)}
            </div>
          </div>
          <div className="spacer" />
          <div className="dh-ltv">
            <div className="k">Lifetime value</div>
            <div className="v">{formatINRLakhs(company.lifetime_value_received)}</div>
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

        {/* AGGREGATE STAT STRIP. Received = lifetime_value_received (real). The
            view has no outstanding/received split, so "Outstanding" is not
            invented — we show the real aggregates the rollup exposes. */}
        <div className="statstrip" style={{ marginBottom: 18 }}>
          <div className="stat">
            <div className="k">People</div>
            <div className="v">{company.contact_count ?? 0}</div>
            <div className="s">contacts</div>
          </div>
          <div className="stat">
            <div className="k">Projects</div>
            <div className="v">{totalProjects}</div>
            <div className="s">{activeProjects} active</div>
          </div>
          <div className="stat">
            <div className="k">Deals</div>
            <div className="v">{company.total_deals ?? 0}</div>
            <div className="s">total</div>
          </div>
          <div className="stat">
            <div className="k">Received</div>
            <div className="v" style={{ color: 'var(--color-success-text)' }}>
              {formatINRLakhs(company.lifetime_value_received)}
            </div>
            <div className="s">across all projects</div>
          </div>
        </div>

        <div className="dgrid">
          {/* LEFT META */}
          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h3>Company details</h3>
              </div>
              <div className="card-b" style={{ paddingTop: 8 }}>
                <div className="meta-row">
                  <span className="k">Company ID</span>
                  <span
                    className="mono"
                    style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}
                  >
                    {company.display_id}
                  </span>
                </div>

                <CompanyDetailInlineText
                  companyId={company.id}
                  field="industry"
                  label="Industry"
                  value={company.industry}
                />
                <CompanyDetailInlineText
                  companyId={company.id}
                  field="website"
                  label="Website"
                  value={company.website}
                />
                <CompanyDetailInlineSelect
                  companyId={company.id}
                  field="company_size"
                  label="Company size"
                  value={company.company_size}
                  options={sizeOptions}
                  allowEmpty
                />
                <CompanyLocationField
                  companyId={company.id}
                  city={company.city}
                  state={company.state}
                  country={company.country}
                />

                <CompanyOwnerEditor
                  companyId={company.id}
                  ownerId={company.account_owner_id}
                  users={users}
                />
              </div>
            </div>

            <CompanyCredentialsReveal credentials={credentials} />

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
                <CompanyAttachmentsAdd companyId={company.id} />
              </div>
            </div>
          </div>

          {/* CENTER — People panel (center-of-gravity) + account Conversation */}
          <div className="stack">
            <PeoplePanel contacts={contacts} />
            <CompanyConversationThread
              companyId={company.id}
              companyName={company.name}
              entries={conversation}
            />
          </div>

          {/* RIGHT */}
          <div className="stack">
            {/* AI Supervisor */}
            <div className="card ai-card" data-testid="card-ai-insights">
              <div className="card-h" style={{ borderBottom: 0, paddingBottom: 4 }}>
                <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
                <h3>AI Supervisor</h3>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)' }}>
                  on {firstName}
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
                    const meta = i.sentiment ? SENTIMENT_ICON[i.sentiment as keyof typeof SENTIMENT_ICON] : null;
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

            {/* Projects */}
            <div className="card">
              <div className="card-h">
                <h3>Projects</h3>
                <span className="cnt">
                  {activeProjects} active · {totalProjects} total
                </span>
                <Link href="/projects" className="more more-link">
                  All
                </Link>
              </div>
              <div className="card-b" style={{ padding: '8px 14px' }}>
                {projects.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No projects.</p>
                ) : (
                  projects.map((p) => {
                    const pct = pctNum(p.completion_pct);
                    return (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="sum"
                        style={{ textDecoration: 'none', alignItems: 'flex-start' }}
                      >
                        <Kanban size={16} style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }} />
                        <div className="t" style={{ flex: 1 }}>
                          <div className="l1">{p.name}</div>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}
                          >
                            <div className="pct-bar">
                              <span style={{ width: `${pct}%` }} />
                            </div>
                            <span
                              className="mono"
                              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-tertiary)' }}
                            >
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <span className="status" style={{ alignSelf: 'center' }}>
                          {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            {/* Deals */}
            <div className="card">
              <div className="card-h">
                <h3>Deals</h3>
                <span className="cnt">{deals.length}</span>
                <Link href="/deals" className="more more-link">
                  View all
                </Link>
              </div>
              <div className="card-b" style={{ padding: '6px 14px' }}>
                {deals.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No deals.</p>
                ) : (
                  deals.map((d) => (
                    <Link key={d.id} href={`/deals/${d.id}`} className="sum" style={{ textDecoration: 'none' }}>
                      <Handshake size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                      <div className="t">
                        <div className="l1">{d.name}</div>
                        <div className="l2 mono" style={{ fontFamily: 'var(--font-mono)' }}>
                          {d.display_id} · {formatMoney(d.deal_value, d.currency)}
                        </div>
                      </div>
                      <span className="status">{DEAL_STAGE_LABEL[d.stage] ?? d.stage}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Active tasks */}
            <div className="card">
              <div className="card-h">
                <h3>Active tasks</h3>
                <span className="cnt">{tasks.length} across company</span>
              </div>
              <div className="card-b" style={{ padding: '6px 14px' }}>
                {tasks.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No active tasks.</p>
                ) : (
                  tasks.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="sum" style={{ textDecoration: 'none' }}>
                      <span className="check" />
                      <div className="t">
                        <div className="l1">{t.title}</div>
                        <div className="l2">{t.display_id}</div>
                      </div>
                      {t.plan_due_date ? (
                        <span
                          className="schedule"
                          style={{
                            background: 'var(--color-warning-bg)',
                            color: 'var(--color-warning-text)',
                            border: '1px solid var(--color-warning-border)',
                          }}
                        >
                          Due {formatDate(t.plan_due_date)}
                        </span>
                      ) : (
                        <span className="status">{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                      )}
                    </Link>
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
                  <CompanyNotesAdd companyId={company.id} />
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
