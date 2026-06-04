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

import { AppShell } from '@/components/shell/AppShell';
import { DetailInlineText, DetailInlineSelect } from '@/components/contacts/DetailInlineField';
import { StatusPillEditor } from '@/components/contacts/StatusPillEditor';
import { DetailOwnersEditor } from '@/components/contacts/DetailOwnersEditor';
import { DetailLeadSourcesEditor } from '@/components/contacts/DetailLeadSourcesEditor';
import { ConversationThread } from '@/components/contacts/ConversationThread';
import { CredentialsReveal } from '@/components/contacts/CredentialsReveal';
import { NotesAdd } from '@/components/contacts/NotesAdd';
import { HeaderName } from '@/components/contacts/HeaderName';
import { LocationField } from '@/components/contacts/LocationField';
import { AttachmentsAdd } from '@/components/contacts/AttachmentsAdd';

import {
  getContact,
  listContactProjects,
  listContactMilestones,
  listContactTasks,
  listContactDeals,
  listContactCredentials,
} from '@/lib/actions/contacts';
import {
  listConversation,
  listNotes,
  listAttachments,
  listAiInsights,
} from '@/lib/actions/polymorphic';
import { listActiveUsers, listCompanies, listOwnersForContacts } from '@/lib/actions/directory';

import {
  PLATFORMS,
  avatarBg,
  initials,
  formatINRLakhs,
  formatDate,
  formatDateTime,
} from '@/lib/ui';
import { PROJECT_STATUS_LABEL } from '@/lib/ui-projects';
import { MILESTONE_STATUS_LABEL } from '@/lib/ui-milestones';
import { TASK_STATUS_LABEL } from '@/lib/ui-tasks';
import { DEAL_STAGE_LABEL, formatMoney } from '@/lib/ui-deals';

import type {
  ContactRollup,
  LeadSource,
  ConversationRow,
  NoteRow,
  AttachmentRow,
  AiInsightRow,
  ContactProjectRow,
  ContactMilestoneRow,
  ContactTaskRow,
  ContactDealRow,
  ContactCredentialRow,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

// Sentiment → icon + color var for the AI Supervisor card.
const SENTIMENT_ICON = {
  positive: { Icon: TrendingUp, color: 'var(--color-ai-positive)' },
  neutral: { Icon: Info, color: 'var(--color-ai-neutral)' },
  risk: { Icon: TriangleAlert, color: 'var(--color-ai-risk)' },
} as const;

// /contacts/[id] — the three-column contact cockpit. Server Component; every read
// is RLS-gated via the server actions. Developers are walled (getContact → null).
export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await denyDevelopers();
  const { id } = await params;

  const result = await getContact(id);
  if (!result) notFound(); // not found OR RLS-denied — indistinguishable, by design

  const contact = result.contact as ContactRollup;
  const leadSources = result.leadSources as LeadSource[];

  // Fan out the rest of the cockpit reads (all RLS-gated).
  const [
    users,
    companies,
    ownerRows,
    conversation,
    notes,
    attachments,
    insights,
    projects,
    milestones,
    tasks,
    deals,
    credentials,
  ] = await Promise.all([
    listActiveUsers(),
    listCompanies(),
    listOwnersForContacts([contact.id]),
    listConversation('contact', contact.id) as Promise<ConversationRow[]>,
    listNotes('contact', contact.id) as Promise<NoteRow[]>,
    listAttachments('contact', contact.id) as Promise<AttachmentRow[]>,
    listAiInsights('contact', contact.id) as Promise<AiInsightRow[]>,
    listContactProjects(contact.id) as Promise<ContactProjectRow[]>,
    listContactMilestones(contact.id) as Promise<ContactMilestoneRow[]>,
    listContactTasks(contact.id) as Promise<ContactTaskRow[]>,
    listContactDeals(contact.id) as Promise<ContactDealRow[]>,
    listContactCredentials(contact.id) as Promise<ContactCredentialRow[]>,
  ]);

  const owners = ownerRows.map((o) => ({
    user_id: o.user_id,
    full_name: o.full_name,
    email: null,
    status: o.status,
  }));

  const company = contact.company_id
    ? companies.find((c) => c.id === contact.company_id) ?? null
    : null;

  const firstName = contact.full_name?.trim().split(/\s+/)[0] ?? contact.full_name;
  const ratingClass = contact.rating ?? '';

  const platformOptions = PLATFORMS.map((p) => ({ value: p, label: p }));
  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));

  const linkCount = attachments.filter((a) => a.kind === 'link').length;
  const fileCount = attachments.length - linkCount;

  // Location is three columns; we surface them as three inline fields so each
  // auto-saves its own column (city/state/country) — no synthetic combined field.

  return (
    <AppShell title="Contact">
      <div data-testid="contact-detail">
        {/* HEADER */}
        <div className="detail-head">
          <span className="avatar lg" style={{ background: avatarBg(contact.id) }}>
            {initials(contact.full_name)}
          </span>
          <div className="dh-main">
            <div className="dh-title-row">
              {/* Inline-editable NAME (Playwright edits this) */}
              <div data-testid="contact-field-full_name" className="dh-name">
                <HeaderName contactId={contact.id} value={contact.full_name} />
              </div>
              <StatusPillEditor contactId={contact.id} status={contact.status} />
              {contact.rating && <span className={`rating ${ratingClass}`}>{capitalize(contact.rating)}</span>}
            </div>
            <div className="dh-sub">
              {contact.job_title ? <>{contact.job_title}{' · '}</> : null}
              {company ? (
                <>
                  <Link href={`/companies/${company.id}`}>{company.name}</Link>
                  {' · '}
                </>
              ) : null}
              Created {formatDate(contact.created_at)} · Updated {formatDateTime(contact.updated_at)}
            </div>
          </div>
          <div className="spacer" />
          <div className="dh-ltv">
            <div className="k">Lifetime value</div>
            <div className="v">{formatINRLakhs(contact.lifetime_value_received)}</div>
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

        <div className="dgrid">
          {/* LEFT */}
          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h3>Contact details</h3>
              </div>
              <div className="card-b" style={{ paddingTop: 8 }}>
                <div className="meta-row">
                  <span className="k">Contact ID</span>
                  <span
                    className="mono"
                    style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}
                  >
                    {contact.display_id}
                  </span>
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

                <DetailInlineText contactId={contact.id} field="email" label="Email" value={contact.email} />
                <DetailInlineText contactId={contact.id} field="phone" label="Phone" value={contact.phone} mono />
                <DetailInlineText contactId={contact.id} field="whatsapp" label="WhatsApp" value={contact.whatsapp} mono />
                <DetailInlineText contactId={contact.id} field="slack_id" label="Slack ID" value={contact.slack_id} mono />
                <DetailInlineSelect
                  contactId={contact.id}
                  field="main_platform"
                  label="Main platform"
                  value={contact.main_platform}
                  options={platformOptions}
                  allowEmpty
                />
                <LocationField
                  contactId={contact.id}
                  city={contact.city}
                  state={contact.state}
                  country={contact.country}
                />

                <DetailOwnersEditor contactId={contact.id} owners={owners} userOptions={users} />
                <DetailLeadSourcesEditor contactId={contact.id} leadSources={leadSources} />

                <DetailInlineText
                  contactId={contact.id}
                  field="teams_channel"
                  label="Teams channel"
                  value={contact.teams_channel}
                  mono
                />
              </div>
            </div>

            <CredentialsReveal credentials={credentials} />

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
                <AttachmentsAdd contactId={contact.id} />
              </div>
            </div>
          </div>

          {/* CENTER — Conversation */}
          <ConversationThread
            contactId={contact.id}
            contactName={contact.full_name}
            entries={conversation}
          />

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
                      <Kanban size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                      <div className="t">
                        <div className="l1">{p.name}</div>
                        <div className="l2">{p.display_id}</div>
                      </div>
                      <span className="status">{PROJECT_STATUS_LABEL[p.status] ?? p.status}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Open milestones */}
            <div className="card">
              <div className="card-h">
                <h3>Open milestones</h3>
                <span className="cnt">{milestones.length}</span>
              </div>
              <div className="card-b" style={{ padding: '6px 14px' }}>
                {milestones.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No open milestones.</p>
                ) : (
                  milestones.map((m, idx) => (
                    <div className="sum" key={m.id}>
                      <span
                        className="ms-num"
                        style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }}
                      >
                        {idx + 1}
                      </span>
                      <div className="t">
                        <div className="l1">{m.name}</div>
                        <div className="l2">{m.display_id}</div>
                      </div>
                      {m.target_date ? (
                        <span
                          className="schedule"
                          style={{
                            background: 'var(--color-warning-bg)',
                            color: 'var(--color-warning-text)',
                            border: '1px solid var(--color-warning-border)',
                          }}
                        >
                          Due {formatDate(m.target_date)}
                        </span>
                      ) : (
                        <span className="status">{MILESTONE_STATUS_LABEL[m.status] ?? m.status}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Active tasks */}
            <div className="card">
              <div className="card-h">
                <h3>Active tasks</h3>
                <span className="cnt">{tasks.length}</span>
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

            {/* Notes */}
            <div className="card" data-testid="card-notes">
              <div className="card-h">
                <h3>Notes</h3>
                <span className="cnt">{notes.length}</span>
                <span className="more">
                  <NotesAdd contactId={contact.id} />
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
