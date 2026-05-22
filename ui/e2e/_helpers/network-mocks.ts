/**
 * Network mock helpers -- shared across e2e specs that need to
 * simulate offline / auth-error / server-error / slow-response
 * conditions without taking down the real preview server.
 *
 * Each helper uses page.route() to intercept matching requests. The
 * intercepts cover JUST /api/* by default -- static assets (HTML +
 * JS + CSS + images) still load normally so the app boots even when
 * its API layer is mocked.
 */

import type { Page } from '@playwright/test';

/** All /api/* requests fail with a network error. context.setOffline
 *  is also flipped so the browser's navigator.onLine reflects the
 *  state (online-status.ts subscribes to that event). */
export async function mockOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
}

/** Reverse mockOffline. Lets a spec test the offline -> online
 *  recovery transition. */
export async function restoreOnline(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: 'wait' });
  await page.context().setOffline(false);
}

/** Every /api/* request returns 401 with a Location header to /login.
 *  Used to verify auth-redirect handling (the api.ts client surfaces
 *  this as a goto /login). */
export async function mockAuth401(page: Page): Promise<void> {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 401,
      headers: { location: '/login', 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'unauthorized' }),
    }),
  );
}

/** Every /api/* request returns 500 + a structured error body. */
export async function mockServerError(page: Page, message = 'simulated 500'): Promise<void> {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'server-error', message }),
    }),
  );
}

/** Every /api/* request returns 200 but with `delayMs` of latency.
 *  Used to verify loading-state UI (skeletons, spinners). */
export async function mockSlowResponse(page: Page, delayMs = 2000): Promise<void> {
  await page.route('**/api/**', async (route) => {
    await new Promise((r) => setTimeout(r, delayMs));
    await route.continue();
  });
}
