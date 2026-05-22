/**
 * web-vitals E2E -- verify the layout's web-vitals registration fires
 * + POSTs to /api/vitals when a metric finalises.
 *
 * Production code (+layout.svelte) uses `navigator.sendBeacon` for the
 * transport -- that's the spec-correct path for telemetry beacons +
 * guaranteed delivery during unload. We do NOT modify production.
 *
 * Observation strategy: Playwright's WebKit + mobile-safari drivers
 * do NOT reliably notify route handlers (or `page.on('request')`)
 * about `navigator.sendBeacon` calls. Real Safari users POST to
 * /api/vitals successfully; the driver's introspection hook is the
 * unreliable layer. We compensate by observing the SERVER side:
 * /api/vitals exposes a test-only GET endpoint that returns the
 * cumulative beacon counter since process start. The test reads
 * `before` + `after` snapshots and asserts `after > before` -- a
 * server-truth check that catches a real regression on every engine
 * regardless of driver-level beacon introspection quirks.
 */

import { test, expect } from './fixtures/auth-fixtures';

interface VitalsCount {
  count: number;
  lastAt: number;
  lastName: string | null;
  lastUrl: string | null;
}

test.describe('web-vitals telemetry', () => {
  test('POSTs at least one /api/vitals event on first paint', async ({
    authenticatedPage,
    browserName,
  }) => {
    // STEP 1: snapshot the server-side counter BEFORE navigation.
    // Other concurrent tests may have inflated the running total --
    // we only care about the DELTA between before + after.
    const beforeResp = await authenticatedPage.request.get('/api/vitals');
    expect(beforeResp.status()).toBe(200);
    const before = (await beforeResp.json()) as VitalsCount;

    // STEP 2: visit /inbox + give the dynamic-imported web-vitals
    // chunk time to load + register its callbacks. visibilitychange +
    // pagehide flushes buffered metrics (CLS / INP / LCP / FCP).
    await authenticatedPage.goto('/inbox');
    await authenticatedPage.waitForLoadState('load');
    await authenticatedPage.waitForTimeout(500);
    await authenticatedPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });

    // STEP 3: poll the server counter. WebKit + mobile-safari take
    // 3-5s to flush via sendBeacon; chromium fires in <500ms. The
    // assertion is REAL on every engine -- a regression that breaks
    // the web-vitals -> /api/vitals wire on any one browser must
    // fail this test (no chromium-only escape hatch).
    const timeoutMs = browserName === 'webkit' || browserName === 'mobile-safari' ? 10000 : 3000;
    await expect
      .poll(
        async () => {
          const resp = await authenticatedPage.request.get('/api/vitals');
          if (resp.status() !== 200) return before.count;
          const after = (await resp.json()) as VitalsCount;
          return after.count;
        },
        {
          timeout: timeoutMs,
          intervals: [100, 200, 500, 1000],
          message: `web-vitals must emit >=1 /api/vitals beacon on ${browserName} (before=${before.count})`,
        },
      )
      .toBeGreaterThan(before.count);
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

  test('GET /api/vitals returns the running counter', async ({ authenticatedPage }) => {
    // Sanity check the test-only observability endpoint exists +
    // increments on POST. Without this test a server-side regression
    // that breaks the counter (e.g. logEvent throwing before the
    // counter increment runs) would silently break the other
    // web-vitals tests.
    const before = (await (
      await authenticatedPage.request.get('/api/vitals')
    ).json()) as VitalsCount;
    const post = await authenticatedPage.request.post('/api/vitals', {
      data: { name: 'LCP', value: 999.0, rating: 'good', url: '/test-fixture' },
    });
    expect(post.status()).toBe(204);
    const after = (await (
      await authenticatedPage.request.get('/api/vitals')
    ).json()) as VitalsCount;
    expect(after.count).toBeGreaterThan(before.count);
    expect(after.lastName).toBe('LCP');
    expect(after.lastUrl).toBe('/test-fixture');
  });
});
