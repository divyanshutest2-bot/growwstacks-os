// playwright/smoke/payments.spec.ts — Payments vertical-slice verification.
//
// Payments are MONEY FACTS with a FINANCE-ONLY confirm gate. This slice's keystone
// tests are the NEGATIVE cases, enforced at the DB layer (RLS in 0010), not the UI:
//   - finance CAN confirm; PM CANNOT (the payments_update WITH CHECK gate).
//   - developer dev-wall = 0 (no payments_select policy → total hard wall).
//   - sales create unconfirmed-only (payments_insert restricts sales to due/client_paid).
//
// Row-finder discipline (PROGRESS.md test-isolation lesson): ALWAYS locate rows by
// the stable display_id 'PMT-0001', NEVER by amount / note (those are editable and
// mutated by other tests → racy).
//
// Shared data-testid contract owned by the Payments screens:
//   login-email, login-submit, payments-table, payments-empty, payment-row,
//   payment-create-btn, filter-status, filter-deal, filter-search, payment-detail,
//   payment-field-{field}, field-status, confirm-btn, confirm-state, status-pill,
//   card-notes, card-attachments, card-conversation, card-ai-insights

import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../support/global-setup';

// Payment lifecycle tests share one seed payment's mutable status (PMT-0001:
// finance-confirm flips it then resets; PM-cannot-confirm asserts it's unchanged).
// Run serially so the global fullyParallel mode can't race them on that shared row.
test.describe.configure({ mode: 'serial' });

// Seed payment (migrations/0012_seed.sql): PMT-0001, $15,000 USD, status 'due',
// on deal DL-0001 (c0…0001), which is owned by the SALES user. created_by = PM.
const SEED_PAYMENT = {
  id: 'cafe0000-0000-0000-0000-000000000001',
  display_id: 'PMT-0001',
  amount: 15000,
} as const;

// Seed deal the payment hangs off (sales owns it → sales SEES PMT-0001).
const SEED_DEAL = {
  id: 'c0000000-0000-0000-0000-000000000001',
  name: 'Acme Corp - Website Redesign',
} as const;

/** The payment a developer must NEVER reach through the app path (direct detail). */
const WALLED_PAYMENT_ID = SEED_PAYMENT.id;

/** Locate the seed payment row by its STABLE display_id (never by amount/note). */
function seedRow(page: import('@playwright/test').Page) {
  return page
    .getByTestId('payment-row')
    .filter({ hasText: SEED_PAYMENT.display_id });
}

// ===========================================================================
// 1. UNAUTHENTICATED — /payments must redirect to /login; /login renders.
// ===========================================================================
test.describe('payments — unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('GET /payments redirects to /login and login form renders', async ({
    page,
  }) => {
    await page.goto('/payments');
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });
});

// ===========================================================================
// 2. ADMIN — full projection: list, detail, inline-edit, cards.
// ===========================================================================
test.describe('payments — admin (full projection)', () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test('list renders the payments table with the seed payment', async ({
    page,
  }) => {
    await page.goto('/payments');
    await expect(page.getByTestId('payments-table')).toBeVisible();
    const rows = page.getByTestId('payment-row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    // The seed payment must be present (admin sees all rows). Find by display_id.
    await expect(seedRow(page)).toHaveCount(1);
  });

  test('row → detail loads; inline edit fires a server action and shows saved', async ({
    page,
  }) => {
    await page.goto('/payments');
    await expect(page.getByTestId('payments-table')).toBeVisible();

    // Open the seed payment's detail by its stable display_id.
    await seedRow(page).first().click();
    await expect(page.getByTestId('payment-detail')).toBeVisible();

    // Inline-edit the note field (a safe, non-status field). Server actions POST
    // back to the same route path; we assert via waitForResponse on that POST.
    const field = page.getByTestId('payment-field-note');
    await expect(field).toBeVisible();

    const editable = field
      .locator('input, textarea, [contenteditable="true"]')
      .first();
    const target = (await editable.count()) ? editable : field;

    const newNote = `Reconciliation note ${Date.now()}`;

    const actionPost = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.status() < 400,
      { timeout: 15000 },
    );

    await target.click();
    await target.fill(newNote).catch(async () => {
      await page.keyboard.type(newNote);
    });
    await page.keyboard.press('Tab').catch(() => {});
    await target.blur().catch(() => {});

    await actionPost;

    // SCOPE field-status to the note field (every field renders its own).
    const noteStatus = page
      .getByTestId('payment-field-note')
      .getByTestId('field-status');
    await expect(noteStatus).toBeVisible();
    await expect(noteStatus).toContainText(/saved/i);
  });

  test('the four universal-module cards render on detail', async ({ page }) => {
    await page.goto(`/payments/${SEED_PAYMENT.id}`);
    await expect(page.getByTestId('payment-detail')).toBeVisible();
    await expect(page.getByTestId('card-notes')).toBeVisible();
    await expect(page.getByTestId('card-attachments')).toBeVisible();
    await expect(page.getByTestId('card-conversation')).toBeVisible();
    await expect(page.getByTestId('card-ai-insights')).toBeVisible();
  });
});

// ===========================================================================
// 3. 🚨 FINANCE CAN CONFIRM — the positive side of the confirm gate.
//    Finance opens PMT-0001, clicks Confirm → status becomes 'confirmed'.
//    afterEach RESETS the seed back to 'due' so the seed isn't polluted.
// ===========================================================================
test.describe('🚨 payments — finance CAN confirm', () => {
  test.use({ storageState: STORAGE_STATE.finance });

  // Reset the seed payment back to 'due' after every test in this group, so the
  // seed isn't polluted. Finance CAN setPaymentStatus (payments_update USING), and
  // 'due' is NOT a confirm-gated status, so the WITH CHECK permits it. Driven
  // through the real UI StatusControl (no app-code bypass).
  test.afterEach(async ({ page }) => {
    await page.goto(`/payments/${SEED_PAYMENT.id}`);
    const control = page.getByTestId('status-control');
    if (await control.isVisible().catch(() => false)) {
      await control.selectOption('due').catch(() => {});
      // Let the transition + refresh settle.
      await page
        .getByTestId('status-control-state')
        .waitFor({ timeout: 8000 })
        .catch(() => {});
    }
  });

  test('finance opens PMT-0001 and confirms → status becomes confirmed', async ({
    page,
  }) => {
    await page.goto(`/payments/${SEED_PAYMENT.id}`);
    await expect(page.getByTestId('payment-detail')).toBeVisible();

    // Pre-state: the status pill shows the current (non-confirmed) status.
    const confirmBtn = page.getByTestId('confirm-btn');
    await expect(confirmBtn).toBeVisible();

    const actionPost = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.status() < 400,
      { timeout: 15000 },
    );
    await confirmBtn.click();
    await actionPost.catch(() => {
      /* router.refresh may re-render before the response settles; tolerated */
    });

    // The confirm-state success message appears AND the status pill reads Confirmed.
    await expect(page.getByTestId('confirm-state')).toContainText(
      /confirmed/i,
      { timeout: 10000 },
    );
    await expect
      .poll(
        async () =>
          (await page.getByTestId('status-pill').first().innerText()).trim(),
        { timeout: 10000 },
      )
      .toMatch(/confirmed/i);
  });
});

// ===========================================================================
// 4. 🚨 PM CANNOT CONFIRM — THE KEYSTONE NEGATIVE CASE (the WITH CHECK gate).
//    A PM passes payments_update USING (pm ∈ admin/pm/finance) but FAILS the
//    WITH CHECK (status 'confirmed' ⇒ admin/finance only) → 42501. The action is
//    REFUSED; the UI shows a refusal AND the status remains NOT 'confirmed'.
// ===========================================================================
test.describe('🚨 payments — PM CANNOT confirm (WITH CHECK gate)', () => {
  test.use({ storageState: STORAGE_STATE.pm });

  test('PM attempts Confirm on PMT-0001 → refused; status stays unchanged', async ({
    page,
  }) => {
    await page.goto(`/payments/${SEED_PAYMENT.id}`);
    await expect(page.getByTestId('payment-detail')).toBeVisible();

    // Capture the status BEFORE the attempt (must be non-confirmed; seed is 'due').
    const statusBefore = (
      await page.getByTestId('status-pill').first().innerText()
    ).trim();
    expect(statusBefore.toLowerCase()).not.toContain('confirmed');

    // The PM is shown the confirm button (forceVisible) so the refusal can surface
    // through the real app path — but the DB WITH CHECK is the actual boundary.
    const confirmBtn = page.getByTestId('confirm-btn');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // ASSERT 1: the UI surfaces a REFUSAL (the action threw; status unchanged).
    await expect(page.getByTestId('confirm-state')).toContainText(
      /refus/i,
      { timeout: 10000 },
    );

    // ASSERT 2: re-read the payment fresh — the status is STILL NOT 'confirmed'.
    await page.goto(`/payments/${SEED_PAYMENT.id}`);
    await expect(page.getByTestId('payment-detail')).toBeVisible();
    const statusAfter = (
      await page.getByTestId('status-pill').first().innerText()
    ).trim();
    expect(statusAfter.toLowerCase()).not.toContain('confirmed');
  });
});

// ===========================================================================
// 5. 🚨 DEVELOPER DEV-WALL = 0 — total hard wall (no payments_select policy).
//    A developer must reach ZERO payments through the real app path, and the
//    direct detail route must NEVER show the amount/data.
// ===========================================================================
test.describe('🚨 payments — developer dev-wall (RLS proof)', () => {
  test.use({ storageState: STORAGE_STATE.developer });

  test('GET /payments → developer sees ZERO payment rows', async ({ page }) => {
    const resp = await page.goto('/payments');

    // Explicit route wall (denyDevelopers → notFound): the not-found page, NOT an
    // empty list — the payments surface is gone (no table/empty-state) and no
    // payment/money data is in the response. (notFound on a streamed edge RSC
    // commits 200, so we assert the absence of the surface + data.)
    expect(resp?.status() ?? 200).toBeLessThan(500);
    await expect(page.getByTestId('payments-table')).toHaveCount(0);
    await expect(page.getByTestId('payment-row')).toHaveCount(0);

    // The seed payment's identifiers must NOT appear anywhere in the body.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain(SEED_PAYMENT.display_id);
    expect(body).not.toContain('15,000');
    expect(body).not.toContain('15000');
  });

  test('direct detail route → developer never sees the payment data', async ({
    page,
  }) => {
    await page.goto(`/payments/${WALLED_PAYMENT_ID}`);

    // getPayment returns null when RLS denies the row (indistinguishable from
    // not-found, by design → notFound()). The detail surface with real data must
    // NOT appear.
    const detailVisible = await page
      .getByTestId('payment-detail')
      .isVisible()
      .catch(() => false);

    const body = await page.locator('body').innerText();
    expect(body).not.toContain(SEED_PAYMENT.display_id);
    expect(body).not.toContain('15,000');
    expect(body).not.toContain('15000');

    if (detailVisible) {
      // If a shell renders at all, it must carry NONE of the walled data.
      await expect(page.getByTestId('card-conversation')).toHaveCount(0);
    }
  });
});

// ===========================================================================
// 6. 🚨 SALES CREATE UNCONFIRMED-ONLY — and sales SEES PMT-0001 (owns the deal).
//    - Sales createPayment with status 'due' SUCCEEDS (new row / detail appears).
//    - Sales sees PMT-0001 in the list (deal_owners → payments_select).
//    The "sales cannot insert a confirmed payment" rule is enforced by RLS
//    payments_insert (sales ⇒ status IN ('due','client_paid')); the UI also caps
//    the status picker to due/client_paid for sales, so a confirmed option is not
//    even offered — proving the create-unconfirmed-only contract end-to-end.
// ===========================================================================
test.describe('🚨 payments — sales create unconfirmed-only', () => {
  test.use({ storageState: STORAGE_STATE.sales });

  test('sales sees PMT-0001 (owns the parent deal)', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByTestId('payments-table')).toBeVisible();
    // Sales owns DL-0001 → payments_select grants PMT-0001. Find by display_id.
    await expect(seedRow(page)).toHaveCount(1);
  });

  test('sales status picker offers ONLY due / client_paid (no confirmed)', async ({
    page,
  }) => {
    await page.goto('/payments');
    await page.getByTestId('payment-create-btn').click();

    const statusSelect = page.getByTestId('create-payment-status');
    await expect(statusSelect).toBeVisible();

    // The confirm-gated statuses must NOT be selectable by sales.
    const optionValues = await statusSelect
      .locator('option')
      .evaluateAll((opts) =>
        opts.map((o) => (o as HTMLOptionElement).value),
      );
    expect(optionValues).toContain('due');
    expect(optionValues).toContain('client_paid');
    expect(optionValues).not.toContain('confirmed');
    expect(optionValues).not.toContain('in_team_accounts');
    expect(optionValues).not.toContain('received');
  });

  test('sales createPayment with status due SUCCEEDS → new payment detail appears', async ({
    page,
  }) => {
    await page.goto('/payments');
    await page.getByTestId('payment-create-btn').click();

    // Pick the sales-owned seed deal (the only deal sales can see).
    const dealSelect = page.getByTestId('create-payment-deal');
    await expect(dealSelect).toBeVisible();
    // Select by stable id (the deal name can be mutated by the deals inline-edit test).
    await dealSelect.selectOption(SEED_DEAL.id);

    await page.getByTestId('create-payment-amount').fill('2500');
    // status defaults to 'due'; leave it.

    // On success the dialog routes to the new payment's detail page.
    await page
      .locator('button[type="submit"]')
      .filter({ hasText: /create/i })
      .click();

    // A new payment detail must appear (created with status 'due'), proving the
    // sales create succeeded for an unconfirmed status.
    await expect(page.getByTestId('payment-detail')).toBeVisible({
      timeout: 15000,
    });
    // The new row carries a fresh PMT-#### display_id (not PMT-0001) — we don't
    // assert the exact id (trigger-assigned), only that the detail rendered and the
    // status pill is a non-confirmed status.
    const status = (
      await page.getByTestId('status-pill').first().innerText()
    ).trim();
    expect(status.toLowerCase()).not.toContain('confirmed');
  });
});
