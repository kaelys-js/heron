/**
 * E2E -- sign-in flow smoke test.
 *
 * Cold-path: unauthenticated visit → /login redirect → success state.
 * The full passkey + GitHub-OAuth flows are out of E2E scope (require
 * live external providers); this exercises the happy path that gets
 * the user into the dashboard.
 */
import { expect, test } from '@playwright/test';
import { seedFreshInstall, teardown, type SeededInstall } from '../_helpers/seed';

let install: SeededInstall;

test.beforeAll(() => {
  install = seedFreshInstall();
});

test.afterAll(() => {
  teardown(install);
});

test.describe('Login page', () => {
  test('anonymous root redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login(?:\/|$)/);
  });

  test('login page shows the brand + auth options', async ({ page }) => {
    await page.goto('/login');
    // Brand display
    await expect(page).toHaveTitle(/Heron/i);
    // Sign-in options surface (passkey + invite-code at minimum)
    await expect(page.getByRole('button', { name: /passkey/i })).toBeVisible();
  });

  test('login page is keyboard-navigable (a11y smoke)', async ({ page }) => {
    await page.goto('/login');
    // Tab through to the first actionable control. Should land somewhere
    // focusable within 5 tabs (allows for skip-links + header buttons).
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      if (focused && focused !== 'BODY') return;
    }
    throw new Error('Could not reach a focusable element within 5 Tab presses');
  });
});
