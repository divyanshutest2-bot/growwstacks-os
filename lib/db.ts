// lib/db.ts — Neon serverless DB layer (edge-safe).
//
// The app connects as the NON-OWNER role `app_user` (via DATABASE_URL). RLS is
// the security boundary; the Postgres role is constant and the *application
// identity* is supplied per request through the `app.current_user_id` GUC.
//
// Edge-safe: uses ONLY @neondatabase/serverless (HTTP driver). No Node APIs.

import { neon } from '@neondatabase/serverless';
import type { NeonQueryPromise } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  // Fail loud at import time rather than silently issuing query-less calls.
  throw new Error('DATABASE_URL is not set');
}

// The tagged-template SQL client. Each call is a stateless HTTP request.
// Default options: arrayMode=false, fullResults=false → queries resolve to row
// objects, and sql.transaction([...]) resolves to an array of row-object arrays.
const sql = neon(process.env.DATABASE_URL);

// The type of a single tagged-template query produced by `sql\`...\``.
// It is a thenable "query promise" that sql.transaction([...]) accepts as an
// array element. Pinned to <false, false> to match the client's default options.
type NeonQuery = NeonQueryPromise<false, false>;

/**
 * asUser — THE SINGLE MANDATORY ENTRY POINT for all user-context DB access.
 *
 * Why a transaction (not two separate calls):
 *   The Neon HTTP driver is STATELESS — every `sql\`...\`` call is its own HTTP
 *   request on a fresh connection. A `set_config(..., is_local => false)` in one
 *   request would NOT carry to the next request, AND is_local=false would set the
 *   GUC at SESSION scope on a pooled connection, leaking the identity into the
 *   next request that happens to reuse that connection.
 *
 *   So we MUST batch the set_config and the query into ONE transaction via
 *   `sql.transaction([...])`, which the driver sends as a single atomic unit on
 *   one connection. We use `set_config(..., true)` — is_local = TRUE — so the GUC
 *   is TRANSACTION-SCOPED: it applies to every statement inside this transaction
 *   and is automatically discarded at COMMIT. No cross-request leak is possible.
 *
 * Returns the rows of `query` (transaction() returns an array of each statement's
 * result; index [1] is the caller's query — [0] is the set_config).
 */
export async function asUser<T = Record<string, unknown>>(
  uid: string,
  query: NeonQuery,
): Promise<T[]> {
  const results = await sql.transaction([
    // is_local = TRUE → transaction-scoped GUC. fn_me() reads this; RLS uses it.
    sql`select set_config('app.current_user_id', ${uid}, true)`,
    query,
  ]);
  // results[0] = set_config row; results[1] = the caller's query rows.
  return results[1] as T[];
}

/**
 * sqlNoUser — the ONLY sanctioned path that runs WITHOUT setting the GUC.
 *
 * Allowed for EXACTLY TWO auth-bootstrap queries that run BEFORE a session
 * exists (so there is no uid to set yet):
 *   1. signIn allowlist lookup (by email)
 *   2. jwt revalidation lookup (by uid)
 *
 * These are safe with no GUC because the `users_select` RLS policy is
 * `USING (true)` — the directory is world-readable to any authenticated role,
 * and these queries only ever read non-sensitive identity columns (id, role,
 * archived_at, status) from `users`. Do NOT use this for anything else; every
 * other query MUST go through asUser so RLS authorizes it against the caller.
 */
export const sqlNoUser = sql;
