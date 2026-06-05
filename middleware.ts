// middleware.ts — route protection (Auth.js v5, edge).
//
// Redirects unauthenticated requests to /login. Public routes: the login page
// and the Auth.js API routes (otherwise the magic-link flow can't complete).
// Static assets are excluded via the matcher.

import { auth } from '@/lib/auth';

// '/api/dev-login' is the DEV-ONLY login shortcut (app/api/dev-login/route.ts),
// hard-guarded to 404 in production — it must be reachable while unauthenticated.
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/dev-login', '/api/logout'];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (isPublic) return;

  if (!req.auth) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
