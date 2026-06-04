// playwright/smoke/users.spec.ts — Users (team directory) vertical-slice verification.
//
// DIFFERENT SHAPE FROM THE OTHER ENTITIES — there is NO dev-wall here:
//   - EVERYONE reads the full directory (users_select USING(true)).
//   - A non-admin self-edits their OWN profile (RLS admin OR id=fn_me()).
//   - Only an ADMIN sees the role/status editor (UI gate) and can change
//     role/status (fn_prevent_role_escalation trigger = the hard DB backstop).
//
// 🚨 THE KEYSTONE (negative assertion): a non-admin cannot change a role even on
// their own row. The UI gates the editor (role-editor count 0 for pm), so the
// authoritative trigger-level assertion lives in scripts/verify-rls.sql §8. Here
// we assert the OBSERVABLE consequence: after a pm visits their own profile, the
// role editor is absent and the role still reads 'pm' (unchanged).
//
// Find rows by display_id, NEVER by an editable value (PROGRESS test-isolation
// lesson — the inline-edit tests mutate name/title).
//
// Shared data-testid contract owned by the Users screens:
//   users-table, users-empty, user-row, user-create-btn, filter-role,
//   filter-status, filter-search, user-detail, user-field-{field}, field-status,
//   role-editor, status-editor, status-dot, card-notes, card-attachments,
//   card-conversation, card-ai-insights

import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../support/global-setup';
import { SEED_USERS } from '../support/seed';

// Seed users (migrations/0012_seed.sql). Find rows by display_id.
const SEED = {
  admin: { id: SEED_USERS.admin, display_id: 'U-0001', role: 'admin' },
  pm: { id: SEED_USERS.pm, display_id: 'U-0002', role: 'pm' },
  developer: { id: SEED_USERS.developer, display_id: 'U-0003', role: 'developer' },
  sales: { id: SEED_USERS.sales, display_id: 'U-0004', role: 'sales' },
  finance: { id: SEED_USERS.finance, display_id: 'U-0005', role: 'finance' },
} as const;

// ===========================================================================
// 1. UNAUTHENTICATED — /users must redirect to /login; /login renders.
// ===========================================================================
test.describe('users — unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('GET /users redirects to /login and login form renders', async ({
    page,
  }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });
});

// ===========================================================================
// 2. DIRECTORY READ FOR EVERY ROLE — admin, pm, developer all see ≥ 5 rows.
//    (users_select USING(true): EVERYONE reads the directory — NO dev-wall.)
// ===========================================================================
for (const role of ['admin', 'pm', 'developer'] as const) {
  test.describe(`users — ${role} reads the full directory`, () => {
    test.use({ storageState: STORAGE_STATE[role] });

    test(`GET /users → ${role} sees the directory (≥ 5 user rows)`, async ({
      page,
    }) => {
      const resp = await page.goto('/users');
      // Authenticated; not a wall — everyone reads the directory.
      expect(resp?.status() ?? 200).toBeLessThan(500);

      await expect(page.getByTestId('users-table')).toBeVisible();
      const rows = page.getByTestId('user-row');
      await expect(rows.first()).toBeVisible();
      expect(await rows.count()).toBeGreaterThanOrEqual(5);

      // All five seed users are present (located by display_id, never by name).
      for (const u of Object.values(SEED)) {
        await expect(
          page.getByTestId('user-row').filter({ hasText: u.display_id }),
        ).toHaveCount(1);
      }
    });
  });
}

// ===========================================================================
// 3. SELF-EDIT OWN PROFILE (non-admin) — pm edits their own phone → 'Saved'.
// ===========================================================================
test.describe('users — pm self-edits own profile', () => {
  test.use({ storageState: STORAGE_STATE.pm });

  test('pm opens own profile (U-0002) and edits phone → fires server action + Saved', async ({
    page,
  }) => {
    await page.goto(`/users/${SEED.pm.id}`);
    await expect(page.getByTestId('user-detail')).toBeVisible();

    const field = page.getByTestId('user-field-phone');
    await expect(field).toBeVisible();
    const input = field.locator('input').first();
    await expect(input).toBeVisible();

    const newPhone = `+1-555-${Date.now().toString().slice(-7)}`;

    const actionPost = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.status() < 400,
      { timeout: 15000 },
    );

    await input.fill(newPhone);
    await input.blur();
    await actionPost;

    // Scope the status assertion to THIS field's wrapper (PROGRESS lesson —
    // field-status matched all fields before).
    const phoneStatus = field.getByTestId('field-status');
    await expect(phoneStatus).toBeVisible();
    await expect(phoneStatus).toContainText(/saved/i);
  });
});

// ===========================================================================
// 4. ADMIN role editor PRESENT; non-admin ABSENT (UI gate).
// ===========================================================================
test.describe('users — role editor visibility (UI gate)', () => {
  test.describe('admin sees the role editor', () => {
    test.use({ storageState: STORAGE_STATE.admin });

    test('admin on a user detail → role-editor + status-editor visible', async ({
      page,
    }) => {
      await page.goto(`/users/${SEED.developer.id}`);
      await expect(page.getByTestId('user-detail')).toBeVisible();
      await expect(page.getByTestId('role-editor')).toBeVisible();
      await expect(page.getByTestId('status-editor')).toBeVisible();
    });
  });

  test.describe('non-admin does NOT see the role editor', () => {
    test.use({ storageState: STORAGE_STATE.pm });

    test('pm on own profile → role-editor count 0 (UI gates it)', async ({
      page,
    }) => {
      await page.goto(`/users/${SEED.pm.id}`);
      await expect(page.getByTestId('user-detail')).toBeVisible();
      await expect(page.getByTestId('role-editor')).toHaveCount(0);
      await expect(page.getByTestId('status-editor')).toHaveCount(0);
      // No create button either (provisioning is admin-only).
      await expect(page.getByTestId('user-create-btn')).toHaveCount(0);
    });
  });
});

// ===========================================================================
// 5. 🚨 KEYSTONE — non-admin self role-change is BLOCKED.
//    The UI gates the editor, so the role NEVER changes through the app for a
//    non-admin: re-reading the pm's own profile, the role still reads 'pm', and
//    the role editor is absent. The authoritative trigger-level assertion (the
//    direct UPDATE that RAISEs) lives in scripts/verify-rls.sql §8.
// ===========================================================================
test.describe('🚨 users — non-admin self role-change is blocked (keystone)', () => {
  test.use({ storageState: STORAGE_STATE.pm });

  test('pm cannot change own role: editor absent and role unchanged (pm)', async ({
    page,
  }) => {
    await page.goto(`/users/${SEED.pm.id}`);
    await expect(page.getByTestId('user-detail')).toBeVisible();

    // The role editor is not rendered for a non-admin → there is no app path to
    // change a role. (verify-rls.sql §8 proves the trigger blocks it even if a
    // direct UPDATE is attempted.)
    await expect(page.getByTestId('role-editor')).toHaveCount(0);

    // Re-read the profile from the list: the pm row still shows the pm role pill.
    await page.goto('/users?role=pm');
    await expect(page.getByTestId('users-table')).toBeVisible();
    const pmRow = page
      .getByTestId('user-row')
      .filter({ hasText: SEED.pm.display_id });
    await expect(pmRow).toHaveCount(1);
    await expect(pmRow).toContainText(/pm/i);
  });
});

// ===========================================================================
// 6. ADMIN CAN change a status — change another user's (U-0003) status, then
//    RESET it back so the seed isn't polluted.
// ===========================================================================
test.describe('users — admin can change role/status', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test('admin changes U-0003 status (active → away) → Saved, then resets to active', async ({
    page,
  }) => {
    await page.goto(`/users/${SEED.developer.id}`);
    await expect(page.getByTestId('user-detail')).toBeVisible();

    const statusEditor = page.getByTestId('status-editor');
    await expect(statusEditor).toBeVisible();
    const select = statusEditor.locator('select');
    await expect(select).toBeVisible();

    // active → away
    const awayPost = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.status() < 400,
      { timeout: 15000 },
    );
    await select.selectOption('away');
    await awayPost;

    const statusSave = statusEditor.getByTestId('field-status');
    await expect(statusSave).toBeVisible();
    await expect(statusSave).toContainText(/saved/i);

    // RESET away → active so the seed stays clean.
    const resetPost = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.status() < 400,
      { timeout: 15000 },
    );
    await select.selectOption('active');
    await resetPost;
    await expect(statusEditor.getByTestId('field-status')).toContainText(
      /saved/i,
    );
  });
});
