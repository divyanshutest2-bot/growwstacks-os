import { FlaskConical, CircleCheck, CircleX, Circle } from 'lucide-react';

import { TEST_TYPE_LABEL } from '@/lib/ui-milestones';
import type { MilestoneTestRow } from '@/lib/actions/milestones';
import { AddTestForm } from '@/components/cards/AddTestForm';
import { ArchiveTestButton } from '@/components/cards/ArchiveTestButton';

// TestsList — the milestone's dev + UAT tests. Each row: pass/fail/pending icon +
// DEV|UAT tag + title. Header summarizes passed/total by type ("dev 2/3 · UAT 1/2").
// Recording/archiving is gated by RLS fn_can_edit('milestone') = admin/pm — so the
// form/archive render only when `canRecord`/`canArchive` (set by the page from the
// caller's role). A member developer sees the rows (SELECT) but no form.
export function TestsList({
  tests,
  parentId,
  canRecord = false,
  canArchive = false,
  defaultType = 'uat',
}: {
  tests: MilestoneTestRow[];
  parentId?: string;
  canRecord?: boolean;
  canArchive?: boolean;
  defaultType?: 'developer' | 'uat';
}) {
  const dev = tests.filter((t) => t.test_type === 'developer');
  const uat = tests.filter((t) => t.test_type === 'uat');
  const passed = (rows: MilestoneTestRow[]) =>
    rows.filter((t) => t.outcome === 'pass').length;

  const summary =
    tests.length === 0
      ? '0 tests'
      : `dev ${passed(dev)}/${dev.length} · UAT ${passed(uat)}/${uat.length}`;

  return (
    <div className="card">
      <div className="card-h">
        <FlaskConical size={16} style={{ color: 'var(--color-text-tertiary)' }} />
        <h3>Tests</h3>
        <span className="cnt">{summary}</span>
      </div>
      {tests.length === 0 ? (
        <div className="card-b">
          <p
            data-testid="test-empty"
            style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}
          >
            No tests recorded for this milestone yet.
          </p>
        </div>
      ) : (
        <div>
          {tests.map((t) => {
            const pass = t.outcome === 'pass';
            const fail = t.outcome === 'fail';
            const Icon = pass ? CircleCheck : fail ? CircleX : Circle;
            const color = pass
              ? 'var(--color-success-text)'
              : fail
                ? 'var(--color-danger-text)'
                : 'var(--color-text-muted)';
            return (
              <div
                className="test-row"
                data-testid="test-row"
                data-test-row-id={t.id}
                key={t.id}
              >
                <Icon size={17} style={{ color }} />
                <span
                  className="tag"
                  style={{
                    textTransform: 'uppercase',
                    fontSize: 9,
                    letterSpacing: '.05em',
                  }}
                >
                  {TEST_TYPE_LABEL[t.test_type] ?? t.test_type}
                </span>
                <span style={{ flex: 1, color: 'var(--color-text-primary)' }}>
                  {t.title ?? 'Untitled test'}
                </span>
                {canArchive && <ArchiveTestButton testId={t.id} />}
              </div>
            );
          })}
        </div>
      )}
      {canRecord && parentId && (
        <div className="card-b" style={{ paddingTop: tests.length ? 10 : 0 }}>
          <AddTestForm
            parentType="milestone"
            parentId={parentId}
            defaultType={defaultType}
          />
        </div>
      )}
    </div>
  );
}
