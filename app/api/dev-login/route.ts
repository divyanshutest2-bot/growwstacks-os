// app/api/dev-login/route.ts — DEV-ONLY login shortcut. NEVER works in production.
//
// Visit (in your own browser, dev server only):
//   http://localhost:<port>/api/dev-login            → logs in as admin → /contacts
//   http://localhost:<port>/api/dev-login?role=developer
//   http://localhost:<port>/api/dev-login?role=pm&next=/projects
//
// It mints the SAME Auth.js session cookie the Playwright suite uses (no app
// behavior is bypassed — RLS still applies via the GUC). Hard-guarded by
// NODE_ENV: in a production build this route returns 404 and never sets a cookie.

import { NextResponse, type NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Fixed seed-user UUIDs (dev seed only — not secrets). Keep in sync with 0012_seed.sql.
const SEED_UIDS: Record<string, string> = {
  admin: '00000000-0000-0000-0000-000000000001',
  pm: '00000000-0000-0000-0000-000000000002',
  developer: '00000000-0000-0000-0000-000000000003',
  sales: '00000000-0000-0000-0000-000000000004',
  finance: '00000000-0000-0000-0000-000000000005',
};

export async function GET(req: NextRequest) {
  // HARD GUARD: dead in production. This shortcut only exists for local dev.
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  const role = (req.nextUrl.searchParams.get('role') || 'admin').toLowerCase();
  const uid = SEED_UIDS[role];
  if (!uid) {
    return new NextResponse(
      `Unknown role "${role}". Use one of: ${Object.keys(SEED_UIDS).join(', ')}`,
      { status: 400 },
    );
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return new NextResponse('AUTH_SECRET is not set in the environment', { status: 500 });
  }

  const isHttps = req.nextUrl.protocol === 'https:';
  const cookieName = isHttps ? '__Secure-authjs.session-token' : 'authjs.session-token';
  const nowSec = Math.floor(Date.now() / 1000);

  // Token shape matches lib/auth.ts jwt() (uid, role, lastChecked) — fresh
  // lastChecked keeps the ≤60s revalidation inert on the first request.
  const value = await encode({
    token: { uid, role, lastChecked: Date.now(), sub: uid, iat: nowSec, exp: nowSec + 30 * 24 * 3600 },
    secret,
    salt: cookieName,
    maxAge: 30 * 24 * 3600,
  });

  const next = req.nextUrl.searchParams.get('next') || '/contacts';
  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin));
  res.cookies.set(cookieName, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isHttps,
  });
  return res;
}
