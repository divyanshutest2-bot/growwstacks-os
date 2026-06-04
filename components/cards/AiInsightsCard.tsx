import { Card } from '@/components/cards/Card';
import { listAiInsights } from '@/lib/actions/polymorphic';
import { SENTIMENT_TEXT, INSIGHT_KIND_LABEL, formatDateTime } from '@/lib/ui';
import type { AiInsightRow } from '@/lib/types';

// AiInsightsCard — universal, generic over (parentType, parentId). Lists
// ai_insights (blocker/highlight, sentiment). May be empty. Read-only here
// (insights are agent-written via the AI layer). Server Component.
export async function AiInsightsCard({
  parentType,
  parentId,
}: {
  parentType: string;
  parentId: string;
}) {
  const insights = (await listAiInsights(
    parentType,
    parentId,
  )) as AiInsightRow[];

  return (
    <Card title="AI insights" testId="card-ai-insights">
      {insights.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No insights yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((i) => {
            const sentimentCls = i.sentiment
              ? SENTIMENT_TEXT[i.sentiment] ?? 'text-ink-secondary'
              : 'text-ink-secondary';
            return (
              <li
                key={i.id}
                className="rounded-md border border-border-subtle bg-ai-tint p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                    {INSIGHT_KIND_LABEL[i.kind] ?? i.kind}
                    {i.sentiment && (
                      <span className={`ml-2 ${sentimentCls}`}>
                        {i.sentiment}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-ink-tertiary">
                    {formatDateTime(i.generated_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink">{i.body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
