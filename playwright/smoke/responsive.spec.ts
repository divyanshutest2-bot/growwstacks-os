// playwright/smoke/responsive.spec.ts — capture screenshots of the key Contacts
// surfaces at the three configured viewports (desktop/tablet/mobile). The
// viewport is set per-project in playwright.config.ts, so running this spec under
// all three projects yields all nine screenshots into playwright/screenshots/.
//
//   npx playwright test responsive.spec.ts
//
// Screenshots are an artifact for human design judgment (the UI-verification
// rule), not a pixel-diff assertion — we only assert the page mounted.

import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../support/global-setup';
import { SEED_CONTACTS } from '../support/seed';

const SHOTS_DIR = 'playwright/screenshots';

test.describe('responsive screenshots', () => {
  test('login page (unauthenticated)', async ({ page }, testInfo) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await expect(page.getByTestId('login-email')).toBeVisible();
    await page.screenshot({
      path: `${SHOTS_DIR}/login-${testInfo.project.name}.png`,
      fullPage: true,
    });
  });

  test.describe('admin surfaces', () => {
    test.use({ storageState: STORAGE_STATE.admin });

    test('contacts list', async ({ page }, testInfo) => {
      await page.goto('/contacts');
      await expect(page.getByTestId('contacts-table')).toBeVisible();
      await page.screenshot({
        path: `${SHOTS_DIR}/contacts-list-${testInfo.project.name}.png`,
        fullPage: true,
      });
    });

    test('contact detail', async ({ page }, testInfo) => {
      await page.goto(`/contacts/${SEED_CONTACTS.alice}`);
      await expect(page.getByTestId('contact-detail')).toBeVisible();
      await page.screenshot({
        path: `${SHOTS_DIR}/contact-detail-${testInfo.project.name}.png`,
        fullPage: true,
      });
    });
  });
});
