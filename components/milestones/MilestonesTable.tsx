import Link from 'next/link';

import {
  MILESTONE_STATUS_LABEL,
  MILESTONE_STATUS_DOT,
  scheduleStateClass,
  formatPct,
  formatMoney,
} from '@/lib/ui-milestones';
import { initials, avatarBg, formatDate, USER_STATUS_DOT } from '@/lib/ui';
import type { MilestoneListRow } from '@/lib/types-milestones';
import type { MilestoneMemberRow } from '@/lib/actions/milestones';

// MilestonesTable — Server Component. Ports Milestones.html's .tbl faithfully,
// driven by real rows from EITHER projection (v_milestone_rollup for full roles,
// v_milestone_dev for developers).
//
// 🚨 The Value column is rendered ONLY when `showValue` is true (non-developer).
// The developer view physically lacks price/currency, so the column is absent and
// no money can leak. completion_pct / schedule_state / name / status are present
// in BOTH shapes, so the rest of the table is identical. Whole-row → /milestones/[id]
// via a stretched <Link> on the name cell (a real anchor → accessible).
export function MilestonesTable({
  milestones,
  members,
  showValue,
}: {
  milestones: MilestoneListRow[];
  members: MilestoneMemberRow[];
  showValue: boolean;
}) {
  const membersByMilestone = new Map<string, MilestoneMemberRow[]>();
  for (const m of members) {
    const list = membersByMilestone.get(m.milestone_id) ?? [];
    list.push(m);
    membersByMilestone.set(m.milestone_id, list);
  }

  return (
    <div className="tbl-wrap">
      <table data-testid="milestones-table" className="tbl">
        <thead>
          <tr>
            <th>Milestone</th>
            <th>Status</th>
            <th>Completion</th>
            <th>Schedule</th>
            <th className="num">Target</th>
            {showValue && <th className="num">Value</th>}
            <th className="num">Tasks</th>
            <th>Owners</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map((m) => {
            const rowMembers = membersByMilestone.get(m.id) ?? [];

            // Square badge tone follows status (done=success, active=accent, else
            // subtle) — Milestones.html cell-name render.
            const badge =
              m.status === 'done'
                ? ['var(--color-success-bg)', 'var(--color-success-text)']
                : m.status === 'in_progress'
                  ? ['var(--color-accent-subtle)', 'var(--color-accent-text)']
                  : ['var(--color-bg-subtle)', 'var(--color-text-tertiary)'];

            const pct = Number(m.completion_pct ?? 0);
            const total = m.total_tasks ?? null;
            const done = m.done_tasks ?? null;

            return (
              <tr
                key={m.id}
                data-testid="milestone-row"
                style={{ position: 'relative' }}
              >
                {/* Milestone */}
                <td>
                  <div className="cell-name">
                    <span
                      className="msq"
                      style={{ background: badge[0], color: badge[1] }}
                    >
                      {m.display_id}
                    </span>
                    <div>
                      <div className="nm">
                        <Link
                          href={`/milestones/${m.id}`}
                          className="after:absolute after:inset-0 after:content-['']"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {m.name}
                        </Link>
                      </div>
                      <div className="co">{m.display_id}</div>
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td>
                  <span data-testid="status-pill" className="status">
                    <span
                      className="dot"
                      style={{
                        background:
                          MILESTONE_STATUS_DOT[m.status] ?? 'var(--n-400)',
                      }}
                    />
                    {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
                  </span>
                </td>

                {/* Completion bar (task-count derived, read-only) */}
                <td>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 6,
                        borderRadius: 999,
                        background: 'var(--color-bg-active)',
                        overflow: 'hidden',
                        flex: 'none',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, pct))}%`,
                          height: '100%',
                          background: 'var(--color-accent)',
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <span
                      className="mono"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {formatPct(m.completion_pct)}
                    </span>
                  </div>
                </td>

                {/* Schedule */}
                <td>
                  {m.schedule_state ? (
                    <SchedulePill state={m.schedule_state} />
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>

                {/* Target */}
                <td
                  className="num mono"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {formatDate(m.target_date)}
                </td>

                {/* Value (non-developer only) */}
                {showValue && (
                  <td
                    className="num mono"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 500,
                      color:
                        m.price == null
                          ? 'var(--color-text-muted)'
                          : 'var(--color-text-primary)',
                    }}
                  >
                    {formatMoney(m.price ?? null, m.currency ?? null)}
                  </td>
                )}

                {/* Tasks (total · done) */}
                <td
                  className="num"
                  style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}
                >
                  {total == null ? (
                    '—'
                  ) : (
                    <>
                      {total} · {done ?? 0} done
                    </>
                  )}
                </td>

                {/* Owners */}
                <td>
                  {rowMembers.length === 0 ? (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  ) : (
                    <div className="ostack">
                      {rowMembers.map((mem) => (
                        <span
                          key={mem.user_id}
                          className="wrap"
                          title={`${mem.full_name ?? ''} (${mem.role})`}
                        >
                          <span
                            className="avatar"
                            style={{ background: avatarBg(mem.user_id) }}
                          >
                            {initials(mem.full_name)}
                          </span>
                          <span
                            className="sdot"
                            style={{
                              background: USER_STATUS_DOT.active,
                            }}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Local schedule badge in the design's .schedule (token-colored) shape.
function SchedulePill({ state }: { state: string }) {
  const cls = scheduleStateClass(state);
  // scheduleStateClass returns Tailwind utility classes (bg-*/text-*/border-*),
  // which resolve to tokens — reuse them on the .schedule shape.
  return <span className={`schedule ${cls}`}>{state}</span>;
}
