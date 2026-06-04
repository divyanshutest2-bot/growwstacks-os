import { notFound } from 'next/navigation';

import { getCurrentUserRole } from '@/lib/auth';

/**
 * denyDevelopers — explicit route-level wall for the TOTAL-wall entities
 * (contacts, companies, deals, payments). Developers have NO access to these in
 * the data model. RLS already returns zero rows for a developer, but relying
 * *only* on empty queries is fragile (a stale client-side router-cache entry from
 * an admin render could re-serve content). Calling this at the top of a page —
 * BEFORE any data fetch — makes the wall explicit: the server returns 404 and
 * emits no contact/company/deal/money data at all. Mirrors the Projects
 * not-found wall; this is defense-in-depth, never UI-only hiding.
 */
export async function denyDevelopers(): Promise<void> {
  if ((await getCurrentUserRole()) === 'developer') notFound();
}

/** isDeveloper — for action-level guards (return [] / null before querying). */
export async function isDeveloper(): Promise<boolean> {
  return (await getCurrentUserRole()) === 'developer';
}
