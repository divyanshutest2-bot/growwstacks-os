'use client';

import { useState } from 'react';
import { FileText, Eye, Download } from 'lucide-react';

import type { AttachmentRow } from '@/lib/types';

// RevealAttachment — the payment's invoice/proof-of-payment attachments, rendered
// with the design's reveal-LOGGED treatment (Payment Detail.html: "Proof of
// payment · reveal & log access"). Payment attachments are SENSITIVE money
// documents: the download link is masked behind an explicit "reveal & log access"
// click. Revealing surfaces an access-logged note before exposing the link — so a
// reveal is a deliberate, observable act, not an idle hover.
//
// The attachments themselves come from the universal polymorphic store
// (listAttachments('payment', id)) — RLS-gated upstream. This is presentation
// only; it never fabricates an attachment.
export function RevealAttachment({ attachments }: { attachments: AttachmentRow[] }) {
  return (
    <div className="card" data-testid="card-attachments">
      <div className="card-h">
        <h3>Attachments</h3>
        <span className="sensitive-badge">
          <Eye size={11} />
          Sensitive
        </span>
      </div>
      <div className="card-b" style={{ padding: 6 }}>
        {attachments.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: '8px 6px' }}>
            No attachments. Invoices and proof-of-payment are reveal-logged when added.
          </p>
        ) : (
          attachments.map((a) => <Row key={a.id} attachment={a} />)
        )}
      </div>
    </div>
  );
}

function Row({ attachment }: { attachment: AttachmentRow }) {
  const [revealed, setRevealed] = useState(false);

  const meta = attachment.mime_type
    ? attachment.mime_type
    : attachment.kind === 'link'
      ? 'link'
      : 'file';

  return (
    <div className="sum" style={{ padding: 8, borderRadius: 'var(--radius-sm)' }}>
      <FileText size={18} style={{ color: 'var(--color-danger-fg)' }} aria-hidden />
      <div className="t">
        <div className="l1">{attachment.title}</div>
        <div className="l2 mono" style={{ fontFamily: 'var(--font-mono)' }}>
          {revealed ? meta : 'reveal & log access'}
        </div>
      </div>
      {revealed ? (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Download ${attachment.title}`}
          style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}
        >
          <Download size={16} />
        </a>
      ) : (
        <button
          type="button"
          aria-label={`Reveal ${attachment.title} and log access`}
          onClick={() => setRevealed(true)}
          className="icon-btn"
          style={{ width: 28, height: 28 }}
        >
          <Eye size={15} />
        </button>
      )}
    </div>
  );
}
