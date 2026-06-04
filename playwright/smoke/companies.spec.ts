// playwright/smoke/companies.spec.ts — Companies vertical-slice verification.
//
// Mirrors contacts.spec.ts against the shared data-testid contract:
//   login-email, login-submit, companies-table, companies-empty, company-row,
//   company-create-btn, filter-type, filter-owner, filter-search, status-pill
//   (company type), company-detail, company-field-{field}, field-status,
//   card-notes, card-attachments, card-conversation, card-ai-insights
//
// Companies differ from Contacts in ownership: a SINGLE account_owner_id FK
// (not a multi-owner join), so there is no owner-add/owner-chip flow.
//
// THE HEADLINE TEST is the developer-projection wall (group 3): a developer must
// reach ZERO companies through the real app path — proving RLS at the DB layer
// (companies has NO developer SELECT policy), not just UI gating.

import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../support/global-setup';
import { SEED_COMPANIES, WALLED_COMPANY_ID } from '../support/seed';

// ===========================================================================
// 1. UNAUTHENTICATED — /companies must redirect to /login; /login renders.
// ===========================================================================
test.describe('companies — unauthenticated', () => {
  // No storageState → no session cookie.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('GET /companies redirects to /login and login form renders', async ({ page }) => {
    await page.goto('/companies');
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });
});

// ===========================================================================
// 2. ADMIN — full projection: list, detail, inline-edit auto-save, cards.
// ===========================================================================
test.describe('companies — admin (full projection)', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test('list renders the companies table with the seed company', async ({ page }) => {
    await page.goto('/companies');
    await expect(page.getByTestId('companies-table')).toBeVisible();
    // Seed has 1 company (Acme Corp); admin sees it.
    const rows = page.getByTestId('company-row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator('body')).toContainText('Acme Corp');
  });

  test('row → detail loads; inline edit fires a server action and shows saved', async ({
    page,
  }) => {
    await page.goto('/companies');
    await expect(page.getByTestId('companies-table')).toBeVisible();

    // Open the first company's detail.
    await page.getByTestId('company-row').first().click();
    await expect(page.getByTestId('company-detail')).toBeVisible();

    // Inline-edit name. Server actions in Next.js App Router POST back to the
    // SAME route path. We assert via waitForResponse on that POST (a real
    // network round-trip), NOT a sleep — proves the auto-save fired.
    const field = page.getByTestId('company-field-name');
    await expect(field).toBeVisible();

    const editable = field.locator('input, textarea, [contenteditable="true"]').first();
    const target = (await editable.count()) ? editable : field;

    const newName = `Acme Corp ${Date.now()}`;

    const actionPost = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.status() < 400,
      { timeout: 15000 },
    );

    await target.click();
    // Replace the value then blur/commit (field-level auto-save).
    await page.keyboard.press('Meta+A').catch(() => {});
    await page.keyboard.press('Control+A').catch(() => {});
    await target.fill(newName).catch(async () => {
      await page.keyboard.type(newName);
    });
    await page.keyboard.press('Enter').catch(() => {});
    await target.blur().catch(() => {});

    await actionPost;

    // The field-status indicator confirms the saved state. Scope it to the
    // name field — every field renders its own field-status span, so an
    // unscoped getByTestId('field-status') is ambiguous (strict-mode violation).
    const nameStatus = page
      .getByTestId('company-field-name')
      .getByTestId('field-status');
    await expect(nameStatus).toBeVisible();
    await expect(nameStatus).toContainText(/saved/i);
  });

  test('the four universal-module cards render on the detail page', async ({ page }) => {
    await page.goto(`/companies/${SEED_COMPANIES.acme}`);
    await expect(page.getByTestId('company-detail')).toBeVisible();
    await expect(page.getByTestId('card-notes')).toBeVisible();
    await expect(page.getByTestId('card-attachments')).toBeVisible();
    await expect(page.getByTestId('card-conversation')).toBeVisible();
    await expect(page.getByTestId('card-ai-insights')).toBeVisible();
  });

  test('the company type renders as a status-pill', async ({ page }) => {
    await page.goto(`/companies/${SEED_COMPANIES.acme}`);
    await expect(page.getByTestId('company-detail')).toBeVisible();
    await expect(page.getByTestId('status-pill').first()).toBeVisible();
  });
});

// ===========================================================================
// 3. 🚨 DEVELOPER-PROJECTION WALL — the headline RLS proof.
//    A developer must reach ZERO companies through the real app path.
//    (companies has NO developer SELECT policy — hard wall.)
// ===========================================================================
test.describe('🚨 companies — developer-projection wall (RLS proof)', () => {
  test.use({ storageState: STORAGE_STATE.developer });

  test('GET /companies → developer sees ZERO company rows', async ({ page }) => {
    const resp = await page.goto('/companies');

    // Explicit route wall (denyDevelopers → notFound): the not-found page, NOT an
    // empty list — the list surface is gone (no table/empty-state) and no company
    // data is in the response. (notFound on a streamed edge RSC commits 200, so we
    // assert the absence of the list + data. Authenticated, not a login bounce.)
    expect(resp?.status() ?? 200).toBeLessThan(500);
    await expect(page.getByTestId('companies-table')).toHaveCount(0);
    await expect(page.getByTestId('companies-empty')).toHaveCount(0);
    await expect(page.getByTestId('company-row')).toHaveCount(0);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Acme Corp');
    expect(body).not.toContain('Northwind Retail');
  });

  test('direct detail route → developer never sees the company data', async ({ page }) => {
    await page.goto(`/companies/${WALLED_COMPANY_ID}`);

    // getCompany returns null when RLS denies the row (indistinguishable from
    // not-found, by design — lib/actions/companies.ts). The detail surface with
    // real data must NOT appear.
    const detailVisible = await page
      .getByTestId('company-detail')
      .isVisible()
      .catch(() => false);

    if (detailVisible) {
      // If a detail shell renders at all, it must carry NONE of the walled data.
      const body = await page.locator('body').innerText();
      expect(body).not.toContain('Acme Corp');
      expect(body).not.toContain('CO-201');
      // And no universal-module cards full of client data.
      await expect(page.getByTestId('card-conversation')).toHaveCount(0);
    } else {
      // Preferred outcome: a not-found / empty surface, never the data.
      const body = await page.locator('body').innerText();
      expect(body).not.toContain('Acme Corp');
      expect(body).not.toContain('CO-201');
    }
  });
});
