// playwright/smoke/time-logs.spec.ts — cross-cutting step 1: time-log entry on
// the task cockpit. SELF-CLEANING: every test that creates a log archives it
// again, so the canonical seed totals are left untouched.
//
// Race-avoidance: each viewport (desktop/tablet/mobile) operates on a DIFFERENT
// demo task so the three viewports never contend on the same task's rollup
// total. Within a viewport the role tests run SERIALLY (test.describe.serial).
//
// All three tasks are project-1 tasks (the developer is a project member → can
// open + log) and each carries seed time_logs (nonzero rollup total).

import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../support/global-setup';

const TASK_BY_VIEWPORT: Record<string, string> = {
  desktop: '0f000000-0000-0000-0000-000000000001',
  tablet: '0f000000-0000-0000-0000-000000000002',
  mobile: '0f000000-0000-0000-0000-000000000003',
};
const taskFor = (project: string) => TASK_BY_VIEWPORT[project] ?? TASK_BY_VIEWPORT.desktop;

const POST_OK = (timeout = 15000) => ({ timeout } as const);
const waitPost = (page: import('@playwright/test').Page) =>
  page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.status() < 400,
    POST_OK(),
  );
const rowIds = (page: import('@playwright/test').Page) =>
  page
    .getByTestId('time-log-row')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-log-id')));

test.describe.serial('time-log entry on the task cockpit', () => {
  // -------------------------------------------------------------------------
  // DEVELOPER: logs own effort → row appears; archives → row gone. The dev
  // (partial projection) has NO rollup total — the wall holds.
  // -------------------------------------------------------------------------
  test.describe('developer', () => {
    test.use({ storageState: STORAGE_STATE.developer });

    test('logs + archives own time-log row; no rollup total on the dev projection', async ({
      page,
    }, testInfo) => {
      await page.goto(`/tasks/${taskFor(testInfo.project.name)}`);
      await expect(page.getByTestId('task-detail')).toBeVisible();

      // Developer projection → NO total line.
      await expect(page.getByTestId('time-log-total')).toHaveCount(0);
      // Form IS available to a developer.
      await expect(page.getByTestId('time-log-add')).toBeVisible();

      const before = await rowIds(page);

      // Log 13 minutes (not in the seed's 45..245 step-25 set).
      await page.getByTestId('time-log-add').click();
      await page.getByTestId('time-log-minutes').fill('13');
      const post = waitPost(page);
      await page.getByTestId('time-log-save').click();
      await post;

      await expect
        .poll(async () => page.getByTestId('time-log-row').count())
        .toBe(before.length + 1);

      // Archive the row we just created (located by its new data-log-id).
      const after = await rowIds(page);
      const newId = after.find((id) => id && !before.includes(id));
      expect(newId).toBeTruthy();
      const archivePost = waitPost(page);
      await page
        .locator(`[data-testid="time-log-row"][data-log-id="${newId}"] [data-testid="time-log-archive"]`)
        .click();
      await archivePost;

      await expect
        .poll(async () => page.getByTestId('time-log-row').count())
        .toBe(before.length);
    });
  });

  // -------------------------------------------------------------------------
  // ADMIN: can log (own row appears) AND sees the rollup total move up, then
  // back to baseline after archiving. This is where total increment/decrement
  // is validated (admin is full projection + can log).
  // -------------------------------------------------------------------------
  test.describe('admin', () => {
    test.use({ storageState: STORAGE_STATE.admin });

    test('logs → own row + total increments; archive → row gone + total restored', async ({
      page,
    }, testInfo) => {
      await page.goto(`/tasks/${taskFor(testInfo.project.name)}`);
      await expect(page.getByTestId('task-detail')).toBeVisible();

      const total = page.getByTestId('time-log-total');
      await expect(total).toBeVisible();
      const baseline = (await total.innerText()).trim();
      const before = await rowIds(page);

      // Log 120 minutes (+2h — visibly changes the total regardless of rounding).
      await page.getByTestId('time-log-add').click();
      await page.getByTestId('time-log-minutes').fill('120');
      const post = waitPost(page);
      await page.getByTestId('time-log-save').click();
      await post;

      await expect
        .poll(async () => page.getByTestId('time-log-row').count())
        .toBe(before.length + 1);
      await expect
        .poll(async () => (await total.innerText()).trim())
        .not.toBe(baseline); // total moved up

      const after = await rowIds(page);
      const newId = after.find((id) => id && !before.includes(id));
      expect(newId).toBeTruthy();
      const archivePost = waitPost(page);
      await page
        .locator(`[data-testid="time-log-row"][data-log-id="${newId}"] [data-testid="time-log-archive"]`)
        .click();
      await archivePost;

      await expect
        .poll(async () => page.getByTestId('time-log-row').count())
        .toBe(before.length);
      await expect
        .poll(async () => (await total.innerText()).trim())
        .toBe(baseline); // total restored
    });
  });

  // -------------------------------------------------------------------------
  // PM: sees the rollup Total (nonzero, from seed) but gets NO form and NO raw
  // rows (no time_logs SELECT policy). The PM↔time relationship is aggregates
  // only — by design and per the RETURNING trap (a PM who logged could not read
  // it back).
  // -------------------------------------------------------------------------
  test.describe('pm', () => {
    test.use({ storageState: STORAGE_STATE.pm });

    test('sees the rollup total, but NO form and NO raw rows', async ({ page }, testInfo) => {
      await page.goto(`/tasks/${taskFor(testInfo.project.name)}`);
      await expect(page.getByTestId('task-detail')).toBeVisible();

      const total = page.getByTestId('time-log-total');
      await expect(total).toBeVisible();
      const hours = parseFloat((await total.innerText()).replace(/[^\d.]/g, ''));
      expect(hours).toBeGreaterThan(0); // nonzero seed total

      await expect(page.getByTestId('time-log-add')).toHaveCount(0); // no form
      await expect(page.getByTestId('time-log-row')).toHaveCount(0); // no raw rows
    });
  });
});
