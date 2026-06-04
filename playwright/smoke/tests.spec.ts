// playwright/smoke/tests.spec.ts — cross-cutting step 2: record + archive dev/UAT
// tests on the milestone & task cockpits, and the live project Tests pane.
//
// SELF-CLEANING: create → assert → archive → restored. Per-viewport parent IDs so
// the three viewports never contend; serial within the file.
//
// The INSERT/SELECT asymmetry is the headline: a member developer can READ a
// milestone's tests (fn_can_see = membership) but cannot RECORD one
// (fn_can_edit('milestone') = admin/pm). On a TASK, a developer assigned to it
// CAN record (fn_can_edit('task') includes assigned devs).

import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../support/global-setup';

// Project-1 demo parents: the developer is a project member (can open/read) and
// is ASSIGNED to TK1..TK4; PM can edit milestones. All carry seeded tests.
const TASK_BY_VP: Record<string, string> = {
  desktop: '0f000000-0000-0000-0000-000000000001',
  tablet: '0f000000-0000-0000-0000-000000000002',
  mobile: '0f000000-0000-0000-0000-000000000003',
};
const MS_BY_VP: Record<string, string> = {
  desktop: '0e000000-0000-0000-0000-000000000001',
  tablet: '0e000000-0000-0000-0000-000000000002',
  mobile: '0e000000-0000-0000-0000-000000000003',
};
const PROJECT = '0d000000-0000-0000-0000-000000000001';
const taskFor = (p: string) => TASK_BY_VP[p] ?? TASK_BY_VP.desktop;
const msFor = (p: string) => MS_BY_VP[p] ?? MS_BY_VP.desktop;

const waitPost = (page: import('@playwright/test').Page) =>
  page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.status() < 400,
    { timeout: 15000 },
  );
const rowIds = (page: import('@playwright/test').Page) =>
  page
    .getByTestId('test-row')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-test-row-id')));

// Record a test (form is already gated open by the caller), then archive the row
// it created — asserting the count returns to baseline.
async function recordThenArchive(
  page: import('@playwright/test').Page,
  title: string,
) {
  await expect(page.getByTestId('test-add')).toBeVisible();
  const before = await rowIds(page);

  await page.getByTestId('test-add').click();
  await page.getByTestId('test-title').fill(title);
  const post = waitPost(page);
  await page.getByTestId('test-save').click();
  await post;
  await expect
    .poll(async () => page.getByTestId('test-row').count(), { timeout: 15000 })
    .toBe(before.length + 1);

  const after = await rowIds(page);
  const newId = after.find((id) => id && !before.includes(id));
  expect(newId).toBeTruthy();
  const archivePost = waitPost(page);
  await page
    .locator(`[data-testid="test-row"][data-test-row-id="${newId}"] [data-testid="test-archive"]`)
    .click();
  await archivePost;
  await expect
    .poll(async () => page.getByTestId('test-row').count(), { timeout: 15000 })
    .toBe(before.length);
}

test.describe.serial('test recording on milestone & task cockpits', () => {
  // 1) Assigned developer records a developer test on an assigned TASK.
  test.describe('assigned developer (task)', () => {
    test.use({ storageState: STORAGE_STATE.developer });
    test('records a developer test on an assigned task → row appears → archive restores', async ({
      page,
    }, testInfo) => {
      await page.goto(`/tasks/${taskFor(testInfo.project.name)}`);
      await expect(page.getByTestId('task-detail')).toBeVisible();
      await recordThenArchive(page, 'PW dev test');
    });
  });

  // 2) PM records a UAT test on a MILESTONE.
  test.describe('pm (milestone)', () => {
    test.use({ storageState: STORAGE_STATE.pm });
    test('records a uat test on a milestone → row appears → archive restores', async ({
      page,
    }, testInfo) => {
      await page.goto(`/milestones/${msFor(testInfo.project.name)}`);
      await expect(page.getByTestId('milestone-detail')).toBeVisible();
      await recordThenArchive(page, 'PW uat test');
    });
  });

  // 3) Wall: a member developer SEES a milestone's tests but gets NO record form
  //    and NO archive (INSERT/SELECT asymmetry, proven in the UI).
  test.describe('member developer (milestone wall)', () => {
    test.use({ storageState: STORAGE_STATE.developer });
    test('sees seeded milestone tests but has NO record form and NO archive', async ({
      page,
    }, testInfo) => {
      await page.goto(`/milestones/${msFor(testInfo.project.name)}`);
      await expect(page.getByTestId('milestone-detail')).toBeVisible();
      await expect(page.getByTestId('test-row').first()).toBeVisible();
      expect(await page.getByTestId('test-row').count()).toBeGreaterThan(0);
      await expect(page.getByTestId('test-add')).toHaveCount(0);
      await expect(page.getByTestId('test-archive')).toHaveCount(0);
    });
  });

  // 4) Project Tests pane shows the seeded aggregated rows for BOTH projections.
  test.describe('project tests pane — pm', () => {
    test.use({ storageState: STORAGE_STATE.pm });
    test('Tests pane shows seeded rows for PM', async ({ page }) => {
      await page.goto(`/projects/${PROJECT}`);
      await expect(page.getByTestId('project-detail')).toBeVisible();
      await page.locator('.tab').filter({ hasText: 'Tests' }).click();
      await expect(page.getByTestId('project-test-row').first()).toBeVisible();
      expect(await page.getByTestId('project-test-row').count()).toBeGreaterThan(0);
    });
  });
  test.describe('project tests pane — member developer', () => {
    test.use({ storageState: STORAGE_STATE.developer });
    test('Tests pane shows seeded rows for a member developer too', async ({ page }) => {
      await page.goto(`/projects/${PROJECT}`);
      await expect(page.getByTestId('project-detail')).toBeVisible();
      await page.locator('.tab').filter({ hasText: 'Tests' }).click();
      await expect(page.getByTestId('project-test-row').first()).toBeVisible();
      expect(await page.getByTestId('project-test-row').count()).toBeGreaterThan(0);
    });
  });

  // 5) DEV on a NON-member project keeps hitting the existing not-found wall —
  //    already covered by projects.spec's developer-projection wall; no new
  //    assertion needed here.
});
