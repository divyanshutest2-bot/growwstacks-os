// scripts/dev-login.mjs — DEV ONLY. Open a logged-in browser without magic-link.
//
// Mints an Auth.js session cookie for a seed user (same mechanism as the
// Playwright suite — NOT an app-side auth bypass) and opens a headed Chromium
// already signed in, pointed at /contacts. Close the window (or Ctrl-C) to exit.
//
// Prereq: the dev server is running on the same BASE_URL (see the README echo
// at the bottom). Browsers are already installed (npx playwright install).
//
// Usage:
//   BASE_URL=http://localhost:3100 ROLE=admin node scripts/dev-login.mjs
//   ROLE one of: admin | pm | developer | sales | finance   (default admin)

import { readFileSync } from 'node:fs';
import { encode } from 'next-auth/jwt';
import { chromium } from '@playwright/test';

// Load .env.local (AUTH_SECRET) without printing it.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.AUTH_SECRET) {
  console.error('AUTH_SECRET is not set in .env.local'); process.exit(1);
}

const SEED = {
  admin:     '00000000-0000-0000-0000-000000000001',
  pm:        '00000000-0000-0000-0000-000000000002',
  developer: '00000000-0000-0000-0000-000000000003',
  sales:     '00000000-0000-0000-0000-000000000004',
  finance:   '00000000-0000-0000-0000-000000000005',
};

const role = (process.env.ROLE || 'admin').toLowerCase();
const baseURL = process.env.BASE_URL || 'http://localhost:3100';
const uid = SEED[role];
if (!uid) { console.error(`Unknown ROLE "${role}". Use: ${Object.keys(SEED).join(' | ')}`); process.exit(1); }

const cookieName = baseURL.startsWith('https://')
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

// Salt = cookie name (Auth.js v5 requirement). Token shape matches lib/auth.ts.
const nowSec = Math.floor(Date.now() / 1000);
const value = await encode({
  token: { uid, role, lastChecked: Date.now(), sub: uid, iat: nowSec, exp: nowSec + 30 * 24 * 3600 },
  secret: process.env.AUTH_SECRET,
  salt: cookieName,
  maxAge: 30 * 24 * 3600,
});

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ baseURL });
await context.addCookies([
  { name: cookieName, value, url: baseURL, httpOnly: true, sameSite: 'Lax' },
]);
const page = await context.newPage();
await page.goto(`${baseURL}/contacts`);

console.log(`\n✓ Logged in as ${role.toUpperCase()} at ${baseURL}`);
console.log('  Click Contacts / Companies / Deals / Projects in the sidebar.');
console.log('  Open a record, edit a field (it auto-saves on blur).');
console.log('  Close the browser window (or Ctrl-C here) when done.\n');

await new Promise((resolve) => browser.on('disconnected', resolve));
