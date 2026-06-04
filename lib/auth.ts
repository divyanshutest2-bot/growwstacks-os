// lib/auth.ts — Auth.js v5 (next-auth) configuration.
//
// Strategy: JWT sessions (no DB session table). Magic-link Email provider via
// Resend (edge-compatible HTTP API). Access is INVITE-ONLY: a sign-in is only
// permitted when the email matches an ACTIVE public.users row (match-only
// allowlist — no auto-insert). Revocation cadence ≤60s via the jwt callback.
//
// Edge-safe: imports only @neondatabase/serverless (through lib/db) + next-auth.
// Resend is called over plain fetch (no Node mailer).

import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import Resend from 'next-auth/providers/resend';

import { sqlNoUser } from '@/lib/db';

// How often (ms) to re-validate that the user is still active. PROGRESS Auth
// Decision: ≤60s app-layer bounce (Layer 2). Layer 1 (RLS) is immediate.
const REVALIDATE_MS = 60 * 1000;

// Edge-safe adapter mapped onto OUR public.users + auth.verification_token.
// Auth.js asserts the Email (magic-link) provider's adapter methods EXIST on
// every auth() call (config assertion) — even a plain JWT cookie read — so all
// of these must be present or auth() throws MissingAdapter(Methods). With the
// JWT session strategy, the session/account methods are never invoked at runtime;
// only the verification-token + user-lookup methods run during a real magic link.
// Invite-only is preserved: createUser NEVER auto-provisions a new user — it only
// resolves an already-invited active user (admin provisions users separately).
// All queries use sqlNoUser (no GUC): they run before a session exists, and
// users_select is USING(true); the auth schema is infra, not RLS-guarded.
type UserRow = { id: string; email: string; full_name: string };
function toAdapterUser(r: UserRow) {
  return { id: r.id, email: r.email, name: r.full_name, emailVerified: null };
}
async function userByEmail(email: string): Promise<UserRow | null> {
  const rows = (await sqlNoUser`
    SELECT id, email, full_name FROM users
    WHERE lower(email) = lower(${email}) AND archived_at IS NULL AND status <> 'left_org'
    LIMIT 1
  `) as UserRow[];
  return rows[0] ?? null;
}
async function userById(id: string): Promise<UserRow | null> {
  const rows = (await sqlNoUser`
    SELECT id, email, full_name FROM users WHERE id = ${id}::uuid AND archived_at IS NULL LIMIT 1
  `) as UserRow[];
  return rows[0] ?? null;
}

const verificationTokenAdapter: Adapter = {
  async createVerificationToken({ identifier, token, expires }) {
    await sqlNoUser`
      INSERT INTO auth.verification_token (identifier, token, expires)
      VALUES (${identifier}, ${token}, ${expires.toISOString()})
    `;
    return { identifier, token, expires };
  },
  async useVerificationToken({ identifier, token }) {
    const rows = (await sqlNoUser`
      DELETE FROM auth.verification_token
      WHERE identifier = ${identifier} AND token = ${token}
      RETURNING identifier, token, expires
    `) as Array<{ identifier: string; token: string; expires: string }>;
    if (!rows[0]) return null;
    return { identifier: rows[0].identifier, token: rows[0].token, expires: new Date(rows[0].expires) };
  },
  async getUserByEmail(email) {
    const u = await userByEmail(email);
    return u ? toAdapterUser(u) : null;
  },
  async getUser(id) {
    const u = await userById(id);
    return u ? toAdapterUser(u) : null;
  },
  async getUserByAccount() {
    return null; // no OAuth accounts — magic-link only
  },
  async createUser(user) {
    // INVITE-ONLY: never auto-provision. Resolve an existing active user or reject.
    const u = user.email ? await userByEmail(user.email) : null;
    if (u) return toAdapterUser(u);
    throw new Error('Sign-up is invite-only; no matching active user');
  },
  async updateUser(user) {
    const u = await userById(user.id);
    if (!u) throw new Error('updateUser: user not found');
    return toAdapterUser(u);
  },
  async linkAccount() {
    return; // unused (no OAuth)
  },
} as Adapter;

type ActiveUser = { id: string; role: string };

/**
 * Active-user lookup by email — the signIn allowlist gate.
 * Runs via sqlNoUser (no GUC) because no session exists yet; safe because
 * users_select is USING(true). MATCH-ONLY: returns the row if the email maps to
 * an active, non-archived, non-left_org user; otherwise null → sign-in rejected.
 */
async function findActiveUserByEmail(email: string): Promise<ActiveUser | null> {
  const rows = (await sqlNoUser`
    SELECT id, role
    FROM users
    WHERE lower(email) = lower(${email})
      AND archived_at IS NULL
      AND status <> 'left_org'
    LIMIT 1
  `) as ActiveUser[];
  return rows[0] ?? null;
}

/**
 * Active-user revalidation by uid — the ≤60s revocation re-check in jwt().
 * Same no-GUC justification as above.
 */
async function findActiveUserById(uid: string): Promise<ActiveUser | null> {
  const rows = (await sqlNoUser`
    SELECT id, role
    FROM users
    WHERE id = ${uid}::uuid
      AND archived_at IS NULL
      AND status <> 'left_org'
    LIMIT 1
  `) as ActiveUser[];
  return rows[0] ?? null;
}

export const authConfig: NextAuthConfig = {
  adapter: verificationTokenAdapter,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days — keeps magic-link email volume tiny.
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: 'login@growwstacks.com',
    }),
  ],
  callbacks: {
    /**
     * signIn — MATCH-ONLY allowlist. Reject unless the email maps to an active
     * users row. On pass, stash users.id on the user object so jwt() can read it.
     */
    async signIn({ user }) {
      const email = user?.email;
      if (!email) return false;
      const active = await findActiveUserByEmail(email);
      if (!active) return false; // not on the allowlist → reject sign-in
      // Carry the canonical UUID + role forward to the jwt callback.
      user.id = active.id;
      (user as { role?: string }).role = active.role;
      return true;
    },

    /**
     * jwt — on sign-in, write uid/role + lastChecked. On every later call, if the
     * revalidation window has elapsed, re-confirm the user is still active; if
     * gone, return null to invalidate the session (forces re-login). This is the
     * Layer-2 ≤60s bounce; Layer 1 (RLS) already denies data immediately.
     */
    async jwt({ token, user }) {
      // Initial sign-in: `user` is present.
      if (user) {
        token.uid = user.id as string;
        token.role = (user as { role?: string }).role ?? null;
        token.lastChecked = Date.now();
        return token;
      }

      // No uid (shouldn't happen post-sign-in) → invalidate.
      if (!token.uid) return null;

      const last = token.lastChecked ?? 0;
      if (Date.now() - last > REVALIDATE_MS) {
        const active = await findActiveUserById(token.uid);
        if (!active) return null; // user archived / left_org → kill session
        token.role = active.role;
        token.lastChecked = Date.now();
      }
      return token;
    },

    /**
     * session — expose the canonical uid + role to the app (server + client).
     */
    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid;
        session.user.role = token.role ?? null;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/**
 * getCurrentUserId — server-side helper. Returns the canonical users.id (UUID)
 * for the logged-in user, or null if there is no valid session. Every server
 * action passes this into asUser(uid, ...).
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * getCurrentUserRole — server-side helper. Returns the logged-in user's role
 * (admin | pm | sales | finance | developer) from the session JWT, or null if
 * there is no valid session.
 *
 * 🚨 This is the COLUMN-SECURITY BRANCH for the Projects slice: the Projects
 * read actions call this to pick the RIGHT view per role — developers read
 * v_project_dev (deal_id/contact_id/company_id/billing PHYSICALLY ABSENT);
 * everyone else reads v_project_rollup. With a single app DB role, column grants
 * are unavailable, so this server-side branch IS the field-stripping boundary.
 * RLS still independently gates ROWS underneath (defence in depth) — a developer
 * who is not a project member sees zero rows regardless of which view is read.
 *
 * The role on the session is refreshed every ≤60s by the jwt revalidation
 * callback above, so it tracks the authoritative users.role.
 */
export async function getCurrentUserRole(): Promise<string | null> {
  const session = await auth();
  return session?.user?.role ?? null;
}
