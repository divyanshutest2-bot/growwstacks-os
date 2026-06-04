'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Search } from 'lucide-react';

import { PAYMENT_STATUSES, PAYMENT_STATUS_LABEL } from '@/lib/ui-payments';

type DealOption = { id: string; label: string };

// PaymentFilters — the design's .filterbar (search-in + status / deal selects).
// Updates the URL searchParams; the Server Component re-fetches via
// listPayments(filters) on navigation. Pure URL state, no client data fetch.
export function PaymentFilters({ deals }: { deals: DealOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`/payments?${next.toString()}`);
    });
  }

  const selectCls = 'fdrop';

  return (
    <div className="filterbar">
      <div className="search-in">
        <Search size={15} style={{ color: 'var(--color-text-muted)' }} aria-hidden />
        <input
          data-testid="filter-search"
          type="search"
          defaultValue={params.get('search') ?? ''}
          onChange={(e) => setParam('search', e.target.value)}
          placeholder="Search payments…"
          aria-label="Search payments"
        />
      </div>

      <select
        data-testid="filter-status"
        value={params.get('status') ?? ''}
        onChange={(e) => setParam('status', e.target.value)}
        className={selectCls}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {PAYMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {PAYMENT_STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      <select
        data-testid="filter-deal"
        value={params.get('deal') ?? ''}
        onChange={(e) => setParam('deal', e.target.value)}
        className={selectCls}
        aria-label="Filter by deal"
      >
        <option value="">All deals</option>
        {deals.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>

      {pending && (
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Updating…</span>
      )}
    </div>
  );
}
