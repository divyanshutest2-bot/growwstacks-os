// playwright/support/global-setup.ts — runs ONCE before the suite.
//
// Responsibilities:
//   1. Load .env.local (so AUTH_SECRET is available to mint cookies, and the dev
//      server started by playwright.config.ts's webServer inherits DATABASE_URL).
//   2. Mint one storageState file per role we test (admin + developer), each
//      carrying a real Auth.js session cookie. Specs reference these via
//      `test.use({ storageState })`.
//
// No magic-link, no DB writes, no app-code bypass. See support/auth.ts for the
// cryptographic details (salt = cookie name; same AUTH_SECRET as the app).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import type { FullConfig } from '@playwright/test';
import { buildStorageState } from './auth';
import type { SeedRole } from './seed';

/** Minimal .env loader (no dependency) — only fills vars that aren't already set. */
function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/** Roles we mint storage state for. Keep in sync with STORAGE_STATE paths below. */
type MintRole = 'admin' | 'pm' | 'developer' | 'sales' | 'finance';
export const STORAGE_STATE: Record<MintRole, string> = {
  admin: resolve(process.cwd(), 'playwright/.auth/admin.json'),
  pm: resolve(process.cwd(), 'playwright/.auth/pm.json'),
  developer: resolve(process.cwd(), 'playwright/.auth/developer.json'),
  sales: resolve(process.cwd(), 'playwright/.auth/sales.json'),
  finance: resolve(process.cwd(), 'playwright/.auth/finance.json'),
};

async function globalSetup(config: FullConfig) {
  loadEnvLocal();

  const baseURL =
    config.projects[0]?.use?.baseURL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    'http://localhost:3000';

  const roles: MintRole[] = ['admin', 'pm', 'developer', 'sales', 'finance'];
  for (const role of roles) {
    const state = await buildStorageState(role as SeedRole, baseURL);
    const out = STORAGE_STATE[role];
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(state, null, 2), 'utf8');
  }
}

export default globalSetup;
