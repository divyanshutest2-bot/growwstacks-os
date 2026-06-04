// playwright/support/auth.ts — mint a real Auth.js v5 session cookie for tests.
//
// WHY THIS EXISTS
// The app authenticates with Auth.js v5 JWT sessions (lib/auth.ts). The only
// production sign-in path is a Resend magic-link, which is NOT wired in test/CI.
// Rather than add an auth-bypass to app code (forbidden — that would defeat the
// whole security model we are trying to PROVE), we mint the exact same encrypted
// JWT session cookie that Auth.js itself would issue, using the supported
// `encode` primitive from `next-auth/jwt` with the same AUTH_SECRET.
//
// HOW AUTH.JS DERIVES THE COOKIE (verified against @auth/core@v5 source):
//   - Cookie name (dev / HTTP):   `authjs.session-token`
//     Cookie name (prod / HTTPS): `__Secure-authjs.session-token`
//   - The encryption key is HKDF-derived from (AUTH_SECRET, salt), and in v5 the
//     SALT IS THE COOKIE NAME. So salt MUST equal the cookie name or the app's
//     own `decode` (which defaults salt = cookieName) cannot decrypt the token.
//   - The token shape must match what lib/auth.ts's jwt() callback wrote on a
//     real sign-in: { uid, role, lastChecked } plus the standard JWT claims
//     (sub/iat/exp/jti) that Auth.js stamps. We set `lastChecked = Date.now()`
//     so the ≤60s Layer-2 revalidation does NOT fire on the first request (it
//     would otherwise re-query the DB; harmless, but we keep the cookie inert).
//
// This is the clean, supported path. No app code is touched.

import { encode, type JWT } from 'next-auth/jwt';
import { SEED_USERS, type SeedRole } from './seed';

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days — matches lib/auth.ts session.maxAge.

/** Roles we mint storage state for. */
export const ROLE_DEFS: Record<SeedRole, { uid: string; role: SeedRole }> = {
  admin: { uid: SEED_USERS.admin, role: 'admin' },
  pm: { uid: SEED_USERS.pm, role: 'pm' },
  developer: { uid: SEED_USERS.developer, role: 'developer' },
  sales: { uid: SEED_USERS.sales, role: 'sales' },
  finance: { uid: SEED_USERS.finance, role: 'finance' },
};

/**
 * Resolve the session cookie name + salt for the configured base URL. Auth.js
 * uses the `__Secure-` prefix only on HTTPS origins; locally over HTTP it does
 * not. Salt always equals the cookie name in v5.
 */
export function sessionCookieName(baseURL: string): string {
  const secure = baseURL.startsWith('https://');
  return secure ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

/**
 * Mint an encrypted Auth.js session JWT for a seed role. Throws if AUTH_SECRET
 * is absent — we must use the SAME secret the app uses, or the app cannot
 * decrypt the cookie (and the test would silently behave as unauthenticated).
 */
export async function mintSessionToken(
  role: SeedRole,
  cookieName: string,
): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_SECRET is not set — cannot mint an Auth.js session cookie. ' +
        'Set it in .env.local (the SAME value the app uses).',
    );
  }

  const def = ROLE_DEFS[role];
  const nowSec = Math.floor(Date.now() / 1000);

  // Token shape mirrors what lib/auth.ts jwt() writes on sign-in.
  const token: JWT = {
    uid: def.uid,
    role: def.role,
    lastChecked: Date.now(),
    sub: def.uid,
    iat: nowSec,
    exp: nowSec + MAX_AGE_SECONDS,
  };

  // salt = cookieName is REQUIRED in Auth.js v5 (the app's decode defaults to it).
  return encode({
    token,
    secret,
    salt: cookieName,
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Build a Playwright storageState object containing the minted session cookie
 * for `role`, scoped to the base URL's host. Written to disk by global-setup and
 * loaded per-project via `storageState` in the spec.
 */
export async function buildStorageState(role: SeedRole, baseURL: string) {
  const url = new URL(baseURL);
  const cookieName = sessionCookieName(baseURL);
  const value = await mintSessionToken(role, cookieName);
  const secure = url.protocol === 'https:';

  return {
    cookies: [
      {
        name: cookieName,
        value,
        domain: url.hostname,
        path: '/',
        httpOnly: true,
        secure,
        sameSite: 'Lax' as const,
        // 30 days out, in seconds-since-epoch (Playwright cookie format).
        expires: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
      },
    ],
    origins: [] as Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>,
  };
}
