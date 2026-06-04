// lib/db.ts - Neon serverless DB layer (edge-safe).
//
// The app connects as the NON-OWNER role `app_user` via DATABASE_URL. RLS is
// the security boundary; the Postgres role is constant and the application
// identity is supplied per request through the `app.current_user_id` GUC.
//
// Edge-safe: uses ONLY @neondatabase/serverless (HTTP driver). No Node APIs.

import { neon } from '@neondatabase/serverless';

// The type of a single tagged-template query produced by `sql`...``.
// It is a thenable "query promise" that sql.transaction([...]) accepts as an
// array element. Pinned to <false, false> to match the client's default options.
type SqlClient = ReturnType<typeof neon>;
type NeonQuery = ReturnType<SqlClient>;

let sqlClient: SqlClient | null = null;

function getSql(): SqlClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  sqlClient ??= neon(databaseUrl);
  return sqlClient;
}

/**
 * asUser - THE SINGLE MANDATORY ENTRY POINT for all user-context DB access.
 *
 * Why a transaction (not two separate calls):
 * The Neon HTTP driver is stateless: every `sql`...`` call is its own HTTP
 * request on a fresh connection. We batch set_config and the caller query into
 * one transaction so the GUC is transaction-scoped and cannot leak across
 * requests.
 */
export async function asUser<T = Record<string, unknown>>(
  uid: string,
  query: NeonQuery,
): Promise<T[]> {
  const sql = getSql();
  const results = await sql.transaction([
    sql`select set_config('app.current_user_id', ${uid}, true)`,
    query,
  ]);
  return results[1] as T[];
}

/**
 * sqlNoUser - the ONLY sanctioned path that runs WITHOUT setting the GUC.
 *
 * Allowed for auth-bootstrap queries that run before a session exists. Other
 * queries must go through asUser so RLS authorizes against the caller.
 */
export const sqlNoUser = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  getSql()(strings, ...values)) as SqlClient;
