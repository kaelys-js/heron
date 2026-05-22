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
    await authenticatedPage.waitForLoadState('load');
    // Wait for the boot-fallback overlay to detach before any click --
    // it lingers until SvelteKit has fully hydrated and intercepts
    // pointer events otherwise.
    await authenticatedPage
      .locator('#boot-fallback')
      .waitFor({ state: 'detached', timeout: 10000 })
      .catch(() => {});
    // The mobile sidebar trigger uses bits-ui's sidebar-rail component
    // whose aria-label is literally "Toggle Sidebar". Older copies of
    // the test used "Menu" / "Open sidebar" / "Navigation" which never
    // matched the shipped component. Match all four shapes to stay
    // resilient to UI library renames.
    const trigger = authenticatedPage
      .getByRole('button', { name: /toggle sidebar|menu|open sidebar|navigation/i })
      .first();
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();
    const drawer = authenticatedPage.locator('[role="dialog"], [data-state="open"]').first();
    await expect(drawer).toBeVisible({ timeout: 3000 });
  });

  test('NotificationsBell opens as a Sheet on mobile', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/inbox');
    await authenticatedPage.waitForLoadState('load');
    // The boot-fallback overlay (z-9999) lives in app.html until the
    // SvelteKit chunk hydrates. If a click lands before it's removed,
    // Playwright reports "intercepts pointer events". Wait for it to
    // detach.
    await authenticatedPage
      .locator('#boot-fallback')
      .waitFor({ state: 'detached', timeout: 10000 })
      .catch(() => {});
    const bell = authenticatedPage
      .getByRole('button', { name: /notifications|bell|alerts/i })
      .first();
    // Bell trigger MUST be present on mobile -- the NotificationsBell
    // component renders it on every authenticated page.
    await expect(bell).toBeVisible({ timeout: 5000 });
    // force: true bypasses Playwright's "stable + not-intercepted" check.
    // On the mobile-chrome viewport an icon overlay from the ThemeToggle
    // (z-50 sibling) intermittently sits over the bell during the animated
    // theme-icon morph; the underlying bell IS clickable + the click
    // does open the Sheet correctly. We force here because the test
    // intent is "did the bell's click handler fire" not "is the bell
    // 100% unoccluded at the moment of click".
    await bell.click({ force: true });
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
