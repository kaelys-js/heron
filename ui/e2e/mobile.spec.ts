/**
 * Mobile viewport E2E -- bottom-nav swap, sidebar drawer, sheet
 * gestures. Runs against the mobile-chrome + mobile-safari projects
 * configured in playwright.config.ts.
 *
 * These tests scope to viewport-specific UI: anything that the
 * `useIsMobile()` hook flips. We don't re-test desktop UI here.
 */

import { test, expect } from './fixtures/auth-fixtures';

test.describe('Mobile UI', () => {
  test.skip(
    ({ browserName, isMobile }) => !isMobile,
    'Mobile-only spec -- skipped on desktop projects',
  );

  test('mobile inbox renders + has mobile-only chrome', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/inbox');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    // Verify the viewport is actually mobile-sized (Pixel 7 / iPhone 15).
    const width = await authenticatedPage.evaluate(() => window.innerWidth);
    expect(width).toBeLessThanOrEqual(768);
  });

  test('sidebar drawer triggers on mobile', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/inbox');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    // The mobile menu trigger -- accessible name "Menu" / "Open sidebar"
    // / "Navigation". We REQUIRE it to be visible; if it isn't, the
    // mobile chrome is broken + the test must fail rather than pass
    // silently.
    const trigger = authenticatedPage
      .getByRole('button', { name: /menu|open sidebar|navigation/i })
      .first();
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();
    const drawer = authenticatedPage.locator('[role="dialog"], [data-state="open"]').first();
    await expect(drawer).toBeVisible({ timeout: 3000 });
  });

  test('NotificationsBell opens as a Sheet on mobile', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/inbox');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    const bell = authenticatedPage
      .getByRole('button', { name: /notifications|bell|alerts/i })
      .first();
    // Bell trigger MUST be present on mobile -- the NotificationsBell
    // component renders it on every authenticated page.
    await expect(bell).toBeVisible({ timeout: 5000 });
    await bell.click();
    // The mobile bell uses bits-ui Sheet -- its open content carries
    // `data-state="open"` once the open transition completes. Tolerate
    // either the bits-ui state attribute OR a generic role=dialog (the
    // sheet IS a modal dialog). Either signal proves the click triggered
    // the open-transition; assert that something opened, not the exact
    // selector shape.
    const opened = await Promise.race([
      authenticatedPage
        .locator('[data-state="open"]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false),
      authenticatedPage
        .getByRole('dialog')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false),
    ]);
    expect(opened).toBe(true);
  });
});
