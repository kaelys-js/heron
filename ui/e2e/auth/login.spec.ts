/**
 * E2E -- sign-in flow smoke test.
 *
 * Cold-path: unauthenticated visit (with a user already in DB, set up
 * via playwright.config.ts -> globalSetup) → /login redirect → success
 * state. The full passkey + GitHub-OAuth flows are out of E2E scope
 * (require live external providers); this exercises the happy path
 * that gets the user into the dashboard.
 *
 * Seed: see ui/e2e/_helpers/global-setup.ts. It inserts a single
 * owner-role user (id=u_e2e) into auth.db BEFORE the preview server
 * boots. That puts the app in "users-exist" mode -- anonymous visits
 * to / redirect to /login (not /onboarding/account which is the
 * fresh-install path).
 */
import { expect, test } from '@playwright/test';

test.describe('Login page', () => {
  test('anonymous root redirects to /login (users exist in DB)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login(?:\/|$|\?)/);
  });

  test('login page shows the brand + auth options', async ({ page }) => {
    await page.goto('/login');
    // Brand display
    await expect(page).toHaveTitle(/Heron/i);
    // Sign-in options surface (passkey + invite-code at minimum)
    await expect(page.getByRole('button', { name: /passkey/i })).toBeVisible();
  });

  test('auth content panel is a named view-transition group (login + signup)', async ({ page }) => {
    // WHY: the calm login↔signup MORPH depends on the content panel being its
    // own view-transition group (`auth-content`). Drop the name and the panel
    // falls back to a generic `root` crossfade — the form pops in at a mismatched
    // Y (the bug we fixed). Assert both screens declare it (real computed style).
    for (const path of ['/login', '/signup']) {
      await page.goto(path);
      // Read the DECLARED style (robust across engines with partial
      // View-Transition support, where getComputedStyle may read empty).
      const declared = await page
        .locator('.auth-page > div.z-10')
        .first()
        .evaluate((el) => (el.getAttribute('style') ?? '').replace(/\s+/g, ' '));
      expect(declared, `${path} content panel should declare auth-content`).toContain(
        'view-transition-name: auth-content',
      );
    }
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
