/**
 * web-vitals E2E -- verify the layout's web-vitals registration fires
 * + POSTs to /api/telemetry when a metric finalises.
 *
 * Production code (+layout.svelte) uses `navigator.sendBeacon` for the
 * transport -- that's the spec-correct path for telemetry beacons +
 * guaranteed delivery during unload. We do NOT modify production.
 *
 * Observation strategy: Playwright's WebKit + mobile-safari drivers
 * do NOT reliably notify route handlers (or `page.on('request')`)
 * about `navigator.sendBeacon` calls. Real Safari users POST to
 * /api/telemetry successfully; the driver's introspection hook is the
 * unreliable layer. We compensate by observing the SERVER side:
 * /api/telemetry exposes a test-only GET endpoint that returns the
 * cumulative beacon counter since process start. The test reads
 * `before` + `after` snapshots and asserts `after > before` -- a
 * server-truth check that catches a real regression on every engine
 * regardless of driver-level beacon introspection quirks.
 *
 * /api/vitals stays as a thin backward-compat alias (same counter,
 * same logEvent path); the two /api/vitals POST cases below assert it
 * still accepts the legacy `{ name, value, rating, url }` shape.
 */

import { test, expect } from './fixtures/auth-fixtures';

interface VitalsCount {
  count: number;
  lastAt: number;
  lastName: string | null;
  lastRoute: string | null;
}

test.describe('web-vitals telemetry', () => {
  test('POSTs at least one /api/telemetry vitals event on first paint', async ({
    authenticatedPage,
    browserName,
  }) => {
    // STEP 1: snapshot the server-side counter BEFORE navigation.
    // Other concurrent tests may have inflated the running total --
    // we only care about the DELTA between before + after.
    const beforeResp = await authenticatedPage.request.get('/api/telemetry');
    expect(beforeResp.status()).toBe(200);
    const before = (await beforeResp.json()) as VitalsCount;

    // STEP 2: visit /inbox + give the dynamic-imported web-vitals
    // chunk time to load + register its callbacks. The web-vitals lib
    // buffers metrics (CLS / INP / LCP / FCP) and only flushes them to
    // the reporter on a visibilitychange->hidden or pagehide event.
    await authenticatedPage.goto('/inbox');
    await authenticatedPage.waitForLoadState('load');
    await authenticatedPage.waitForTimeout(500);

    // STEP 3: force the flush deterministically. web-vitals gates its
    // flush on `document.visibilityState === 'hidden'`, so dispatching a
    // bare visibilitychange event is not enough -- the lib re-reads the
    // real property and sees 'visible'. We redefine the getter to return
    // 'hidden' for the duration of the dispatch, fire both the
    // visibilitychange and pagehide events the lib listens for, then
    // restore. On WebKit the synthetic-event path is the unreliable layer
    // for the DRIVER's request introspection, NOT for the actual
    // sendBeacon transport -- the beacon still POSTs to /api/telemetry,
    // which is why STEP 4 reads server truth.
    await authenticatedPage.evaluate(() => {
      const proto = Object.getPrototypeOf(document) as object;
      const original = Object.getOwnPropertyDescriptor(proto, 'visibilityState');
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
      // Restore so nothing downstream observes a permanently-hidden doc.
      delete (document as unknown as { visibilityState?: unknown }).visibilityState;
      if (original) Object.defineProperty(document, 'visibilityState', original);
    });

    // STEP 4: poll the server counter. WebKit + mobile-safari take a few
    // seconds to flush via sendBeacon; chromium fires in <500ms. If the
    // synthetic flush above did not land within the first interval (a
    // known WebKit quirk where sendBeacon waits for a real unload), a
    // hard navigation to about:blank fires a genuine native pagehide +
    // visibilitychange->hidden, which forces the queued beacon out. The
    // assertion is REAL on every engine -- a regression that breaks the
    // web-vitals -> /api/telemetry wire on any one browser must fail this
    // test (no chromium-only escape hatch).
    const isWebKit = browserName === 'webkit' || browserName === 'mobile-safari';
    const timeoutMs = isWebKit ? 20000 : 5000;
    let forcedUnload = false;
    await expect
      .poll(
        async () => {
          const resp = await authenticatedPage.request.get('/api/telemetry');
          if (resp.status() === 200) {
            const after = (await resp.json()) as VitalsCount;
            if (after.count > before.count) return after.count;
          }
          // Fallback (runs at most once): a real navigation away fires a
          // native pagehide + visibilitychange->hidden, which forces out
          // any sendBeacon that WebKit held back until a true unload
          // boundary. We navigate to about:blank rather than page.close()
          // so the page-scoped poll can keep reading the server counter.
          if (!forcedUnload) {
            forcedUnload = true;
            await authenticatedPage.goto('about:blank').catch(() => {});
          }
          return before.count;
        },
        {
          timeout: timeoutMs,
          intervals: [100, 200, 500, 1000, 2000],
          message: `web-vitals must emit >=1 /api/telemetry beacon on ${browserName} (before=${before.count})`,
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
    expect(after.lastRoute).toBe('/test-fixture');
  });
});
