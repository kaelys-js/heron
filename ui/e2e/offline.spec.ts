/**
 * Offline E2E -- offline-mode banner + recovery flow.
 *
 * online-status.ts maintains a `<brand>:net-status` reactive store
 * subscribed by the OfflineIndicator + the BackendUnreachableOverlay.
 * When the browser fires `offline`, both flip. When `online` fires,
 * a single re-probe attempts to refresh state.
 */

import { test, expect } from './fixtures/auth-fixtures';
import { mockOffline, restoreOnline } from './_helpers/network-mocks';

test.describe('Offline mode', () => {
  test('offline indicator or unreachable-overlay surfaces when offline', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/inbox');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await mockOffline(authenticatedPage);
    // Trigger the offline event the same way the browser does on a real
    // disconnect -- some Chromium versions don't fire it from
    // setOffline alone.
    await authenticatedPage.evaluate(() => window.dispatchEvent(new Event('offline')));
    // Three valid surfaces for an offline signal (any one is sufficient):
    //   - OfflineIndicator badge with data-testid="offline-indicator"
    //   - aria-label containing "offline"
    //   - BackendUnreachableOverlay with data-testid="backend-unreachable"
    // Assert AT LEAST ONE is visible -- a real regression where every
    // offline-aware component goes dark must fail this test.
    const indicatorVisible = await authenticatedPage
      .locator('[data-testid="offline-indicator"], [aria-label*="offline" i]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const overlayVisible = await authenticatedPage
      .locator('[data-testid="backend-unreachable"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(indicatorVisible || overlayVisible).toBe(true);
    await restoreOnline(authenticatedPage);
  });

  test('recovers when network is restored', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/inbox');
    await mockOffline(authenticatedPage);
    await authenticatedPage.evaluate(() => window.dispatchEvent(new Event('offline')));
    await restoreOnline(authenticatedPage);
    await authenticatedPage.evaluate(() => window.dispatchEvent(new Event('online')));
    // After the online event the page should still be navigable.
    await authenticatedPage.goto('/profile');
    await expect(authenticatedPage).toHaveURL(/\/profile/);
  });
});
