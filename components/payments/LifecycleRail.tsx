import { Check, Clock, Circle, ShieldCheck, FileText, Send } from 'lucide-react';

import { LIFECYCLE_NODES, lifecycleStates } from '@/lib/ui-payments';

// LifecycleRail — the design's draft → sent → paid → confirmed lifecycle rail
// (Payment Detail.html .life). Presentational ONLY: it reads its node states from
// payment_status via lifecycleStates() and NEVER writes status. The finance-gated
// confirm lives in the ConfirmButton / PaymentStatusPill, not here. Server
// Component — no interactivity.
const NODE_ICON = [FileText, Send, Clock, Circle, ShieldCheck] as const;

export function LifecycleRail({ status }: { status: string }) {
  const states = lifecycleStates(status);

  return (
    <div className="life">
      {LIFECYCLE_NODES.map((label, i) => {
        const state = states[i];
        // A 'done' node shows a check; the current node shows its own icon; an
        // upcoming node shows an empty circle outline.
        const Icon =
          state === 'done' ? Check : state === 'current' ? NODE_ICON[i] : Circle;
        const cls = state === 'done' ? 'step done' : state === 'current' ? 'step current' : 'step';
        return (
          <div className={cls} key={label}>
            <div className="node">
              <Icon size={13} aria-hidden />
            </div>
            <div className="lbl">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
