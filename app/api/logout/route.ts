import { NextRequest, NextResponse } from 'next/server';

function buildExpiredCookie(name: string, secure: boolean) {
  const parts = [
    `${encodeURIComponent(name)}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'SameSite=Lax',
  ];

  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearRequestCookies(request: NextRequest, response: NextResponse) {
  const isSecure = request.nextUrl.protocol === 'https:';
  const seen = new Set<string>();

  for (const cookie of request.cookies.getAll()) {
    if (seen.has(cookie.name)) continue;
    seen.add(cookie.name);

    const needsSecure =
      isSecure ||
      cookie.name.startsWith('__Secure-') ||
      cookie.name.startsWith('__Host-');

    response.headers.append('Set-Cookie', buildExpiredCookie(cookie.name, needsSecure));
  }
}

function logout(request: NextRequest) {
  const loginUrl = new URL('/login', request.nextUrl.origin);
  const response = NextResponse.redirect(loginUrl, 303);

  clearRequestCookies(request, response);
  response.headers.set('Cache-Control', 'no-store');

  return response;
}

export async function GET(request: NextRequest) {
  return logout(request);
}

export async function POST(request: NextRequest) {
  return logout(request);
}
