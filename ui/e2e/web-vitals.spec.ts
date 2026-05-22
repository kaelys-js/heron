/**
 * web-vitals E2E -- verify the layout's web-vitals registration fires
 * + POSTs to /api/vitals when a metric finalises.
 */

import { test, expect } from './fixtures/auth-fixtures';

test.describe('web-vitals telemetry', () => {
  test('POSTs at least one /api/vitals event on first paint', async ({
    authenticatedPage,
    browserName,
  }) => {
    // We track REQUESTS (not responses) because the layout dispatches
    // vitals via `navigator.sendBeacon` (fire-and-forget; Playwright's
    // response handler never fires for beacons).
    const seenRequests: string[] = [];
    authenticatedPage.on('request', (req) => {
      if (req.url().includes('/api/vitals')) seenRequests.push(req.url());
    });
    await authenticatedPage.goto('/inbox');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    // visibilitychange flushes web-vitals' buffered metrics. Re-fire
    // both visibilitychange + pagehide -- different browsers subscribe
    // to one or the other depending on browser policy.
    await authenticatedPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    // web-vitals 5.x emits TTFB on `pagehide` for every browser that
    // supports PerformanceObserver -- all five projects do. WebKit +
    // mobile-safari flush slower under emulated visibility flips, so
    // they get a longer grace window. The assertion is REAL on every
    // engine: a regression that breaks sendBeacon wiring on any one
    // browser must fail this test (no chromium-only escape hatch).
    const graceMs = browserName === 'webkit' || browserName === 'mobile-safari' ? 2000 : 800;
    await authenticatedPage.waitForTimeout(graceMs);
    expect(
      seenRequests.length,
      `web-vitals must emit >=1 /api/vitals beacon on ${browserName}`,
    ).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/vitals accepts a valid payload', async ({ authenticatedPage }) => {
    const resp = await authenticatedPage.request.post('/api/vitals', {
      data: { name: 'LCP', value: 1234.5, rating: 'good', url: '/inbox' },
    });
    expect(resp.status()).toBe(204);
  });

  test('POST /api/vitals rejects an invalid payload', async ({ authenticatedPage }) => {
    const resp = await authenticatedPage.request.post('/api/vitals', {
      data: { name: 'LCP' }, // missing value
      failOnStatusCode: false,
    });
    expect(resp.status()).toBe(400);
  });
});
