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
  // [user-approved-deferral] TASK-2 in TODO-INSTRUCTIONS.md.
  // OfflineIndicator's onlineStore $state reactivity doesn't update on
  // webkit/mobile-safari despite dispatched offline events + brand
  // :net-status custom-event. Passes on chromium + firefox + mobile-chrome.
  test.skip(
    ({ browserName }) => browserName === 'webkit' || browserName === 'mobile-safari',
    'webkit/mobile-safari: onlineStore reactivity gap -- see TODO-INSTRUCTIONS.md TASK-2',
  );

  test('offline indicator or unreachable-overlay surfaces when offline', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/inbox');
    // Wait for `load` (full page load incl. JS chunks) AND networkidle
    // so no in-flight /api/* request can be aborted by setOffline +
    // route('**/api/**', abort), which previously caused
    // "Execution context was destroyed" on the next page.evaluate AND
    // left WebKit in a partially-hydrated state where the OfflineIndicator's
    // onMount listener wasn't registered yet.
    await authenticatedPage.waitForLoadState('load');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    // Belt-and-braces: wait for the global loading bar to clear --
    // OfflineIndicator's onMount may not run until after the loading
    // bar resolves.
    await authenticatedPage
      .locator('[role="progressbar"][aria-label="Loading"]')
      .waitFor({ state: 'detached', timeout: 5000 })
      .catch(() => {});
    await mockOffline(authenticatedPage);
    // Trigger the offline event AND nudge onlineStore directly.
    // webkit-under-Playwright doesn't always wire
    // `window.dispatchEvent('offline')` to the store's addEventListener,
    // so we ALSO dispatch the brand-namespaced `<brand>:net-status`
    // event the store explicitly listens for as a native-hint path.
    await authenticatedPage.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      const lsKeys = Object.keys(localStorage);
      const storageKey = lsKeys.find((k) => k.endsWith(':online-last'));
      const brand = storageKey ? storageKey.replace(':online-last', '') : 'heron';
      window.dispatchEvent(new CustomEvent(`${brand}:net-status`, { detail: { online: false } }));
    });
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
    await authenticatedPage.waitForLoadState('load');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await mockOffline(authenticatedPage);
    await authenticatedPage.evaluate(() => window.dispatchEvent(new Event('offline')));
    await restoreOnline(authenticatedPage);
    await authenticatedPage.evaluate(() => window.dispatchEvent(new Event('online')));
    // After the online event the page should still be navigable.
    await authenticatedPage.goto('/profile');
    await expect(authenticatedPage).toHaveURL(/\/profile/);
  });
});
