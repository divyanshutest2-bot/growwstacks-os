import { formatPct } from '@/lib/ui-milestones';

// CompletionCard — READ-ONLY delivery surface shown to BOTH projections, in the
// design's right-rail .card shape (Milestone Detail.html "Completion"). The big
// percentage + bar + the "derived from task count" caption make explicit that
// completion is TASK-COUNT derived and NEVER editable. Hours are a separate effort
// signal (shown in the header statstrip), not completion. completion_pct and the
// task counts come from v_milestone_progress / the view — never stored.
export function CompletionCard({
  completionPct,
  doneTasks,
  totalTasks,
  estimatedHours,
  timeSpentHours,
}: {
  completionPct: string | number | null;
  doneTasks?: number | null;
  totalTasks?: number | null;
  estimatedHours?: string | number | null;
  timeSpentHours?: string | number | null;
}) {
  const pct = Number(completionPct ?? 0);
  const pctClamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const showTasks = totalTasks !== undefined && totalTasks !== null;

  const hoursLine =
    estimatedHours != null
      ? `Hours (${fmtHours(timeSpentHours)}/${fmtHours(estimatedHours)}) are a separate effort signal, not completion.`
      : 'Derived from task count — read-only.';

  return (
    <div className="card" data-testid="card-completion">
      <div className="card-h">
        <h3>Completion</h3>
      </div>
      <div className="card-b">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span className="compbig">{formatPct(completionPct)}</span>
          {showTasks && (
            <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              {doneTasks ?? 0} / {totalTasks} tasks
            </span>
          )}
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: 'var(--color-bg-active)',
            overflow: 'hidden',
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: `${pctClamped}%`,
              height: '100%',
              background: 'var(--color-accent)',
              borderRadius: 999,
            }}
          />
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-text-muted)',
            lineHeight: 1.4,
          }}
        >
          {hoursLine}
        </div>
      </div>
    </div>
  );
}

function fmtHours(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '0';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '0';
  return String(n);
}
