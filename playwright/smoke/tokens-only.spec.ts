// playwright/smoke/tokens-only.spec.ts — runs scripts/check-tokens-only.sh inside
// the Playwright suite so `npx playwright test` enforces the tokens-only rule
// (CLAUDE.md: no hardcoded hex/px outside app/tokens.css). This test needs no
// browser, DB, or auth — it is a pure static check and runs everywhere.
//
// We pin it to a single project to avoid running the shell check 3× (once per
// viewport project); it is viewport-independent.

import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

test.describe('tokens-only static check', () => {
  test('no raw hex/px literals outside app/tokens.css', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'viewport-independent; run once');

    const script = resolve(process.cwd(), 'scripts/check-tokens-only.sh');
    let output = '';
    let failed = false;
    try {
      output = execFileSync('bash', [script], { encoding: 'utf8' });
    } catch (err: unknown) {
      failed = true;
      const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
      output = String(e.stdout ?? '') + String(e.stderr ?? '');
    }
    // Surface the script output in the test report regardless of outcome.
    console.log(output);
    expect(failed, `tokens-only check failed:\n${output}`).toBe(false);
  });
});
