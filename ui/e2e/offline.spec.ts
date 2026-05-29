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
    // Wait for `load` (full page load incl. JS chunks) AND networkidle so the
    // app has hydrated and onlineStore.init() has registered its listeners
    // before we go offline. (The HTTP-preview CSP fix in svelte.config.ts is
    // what lets webkit hydrate here at all -- upgrade-insecure-requests used to
    // rewrite every subresource to https:// and the handshake failed.)
    await authenticatedPage.waitForLoadState('load');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    // Belt-and-braces: wait for the global loading bar to clear.
    await authenticatedPage
      .locator('[role="progressbar"][aria-label="Loading"]')
      .waitFor({ state: 'detached', timeout: 5000 })
      .catch(() => {});
    await mockOffline(authenticatedPage);
    // setOffline already flips navigator.onLine; dispatch the `offline` event
    // so the store's listener runs synchronously without waiting for the 15s
    // health-probe interval. Also exercise the brand-namespaced `:net-status`
    // native-hint path (iOS/Electron forward net changes through it).
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
