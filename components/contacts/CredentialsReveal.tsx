'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Eye, Lock } from 'lucide-react';

import { revealCredential } from '@/lib/actions/contacts';
import type { ContactCredentialRow } from '@/lib/types';

// CredentialsReveal — METADATA-ONLY credentials card. Renders the count + labels;
// NEVER renders secret_ref. "Reveal & log access" records reveal INTENT via the
// revealCredential stub (logs to credential_access_log) and surfaces a small
// status line. Full pgcrypto decrypt is Phase 2 (service-role path).
export function CredentialsReveal({
  credentials,
}: {
  credentials: ContactCredentialRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const count = credentials.length;
  const subtitle =
    count === 0
      ? 'No credentials linked'
      : credentials
          .slice(0, 4)
          .map((c) => c.label)
          .join(' · ');

  function reveal() {
    if (count === 0 || pending) return;
    setMsg(null);
    startTransition(async () => {
      try {
        // Log access for every linked credential (intent record).
        await Promise.all(credentials.map((c) => revealCredential(c.id)));
        setMsg('Access logged · reveal queued');
      } catch {
        setMsg('Reveal not permitted');
      }
    });
  }

  return (
    <div className="card">
      <div className="card-h">
        <h3>Credentials</h3>
        <span
          className="badge"
          style={{
            background: 'var(--color-warning-bg)',
            color: 'var(--color-warning-text)',
            fontSize: 9,
            border: '1px solid var(--color-warning-border)',
          }}
        >
          <Lock size={11} />
          Restricted
        </span>
      </div>
      <div className="card-b">
        <div className="cred" style={{ marginBottom: 12 }}>
          <span className="lock">
            <KeyRound size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {count} encrypted {count === 1 ? 'credential' : 'credentials'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{subtitle}</div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={count === 0 || pending}
          onClick={reveal}
        >
          <Eye size={16} />
          {pending ? 'Logging…' : 'Reveal & log access'}
        </button>
        {msg && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
