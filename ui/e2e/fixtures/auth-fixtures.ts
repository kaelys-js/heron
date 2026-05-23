/**
 * Playwright fixtures -- authenticated context + seeded user reuse.
 *
 * Without fixtures, every spec would re-run the login flow + wait
 * for dashboard hydration before its first assertion. With these
 * fixtures, the first spec per worker mints a bearer token via the
 * E2E-only auth bypass endpoint; subsequent specs reuse the cached
 * token via `extraHTTPHeaders` on a shared browser context.
 *
 * Two fixtures:
 *
 *   - `seededUser`: the constants global-setup.ts wrote (id, email,
 *     name, profile). Use when a spec needs to assert against the
 *     seeded user without hardcoding the ID.
 *
 *   - `authenticatedPage`: a Page whose underlying browser context
 *     carries `Authorization: Bearer <token>` on every request. The
 *     token is minted once per worker via /api/auth/e2e-login and
 *     cached in a worker-scoped fixture so the second + subsequent
 *     specs reuse it.
 *
 * For specs that need a CLEAN (unauthenticated) context -- e.g.
 * login.spec.ts itself -- keep using the base `page` from
 * '@playwright/test'.
 */

import {
  test as base,
  request as playwrightRequest,
  type Page,
  type BrowserContext,
} from '@playwright/test';
import { PREVIEW_BASE_URL } from '../_helpers/preview-server';
import { TEST_PROFILE_SLUG, TEST_USER_EMAIL, TEST_USER_ID, TEST_USER_NAME } from '../_helpers/seed';

export interface SeededUserFixture {
  id: string;
  email: string;
  name: string;
  profileSlug: string;
}

interface AuthFixtures {
  seededUser: SeededUserFixture;
  authToken: string;
  authenticatedContext: BrowserContext;
  authenticatedPage: Page;
}

export const test = base.extend<AuthFixtures>({
  seededUser: async ({}, use) => {
    await use({
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      name: TEST_USER_NAME,
      profileSlug: TEST_PROFILE_SLUG,
    });
  },

  /**
   * Worker-scoped: mint a bearer token ONCE per worker via the e2e
   * auth bypass endpoint. Reused across every spec in the worker.
   * The endpoint 404s on any prod build (guarded on HERON_E2E_DATA_DIR).
   *
   * Implementation note: Playwright's `request` fixture is test-scoped
   * (re-created per test). Worker-scoped fixtures can't depend on
   * test-scoped fixtures, so we use Playwright's standalone
   * `request.newContext()` API to construct a worker-lifetime HTTP
   * client manually.
   */
  authToken: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const ctx = await playwrightRequest.newContext({
        baseURL: PREVIEW_BASE_URL,
      });
      try {
        const resp = await ctx.post('/api/auth/e2e-login', {
          data: { userId: TEST_USER_ID },
          failOnStatusCode: false,
        });
        if (!resp.ok()) {
          throw new Error(
            `auth-fixtures: /api/auth/e2e-login returned ${resp.status()}. ` +
              'Confirm HERON_E2E_DATA_DIR is set on the preview server and ' +
              'global-setup.ts inserted the u_e2e user.',
          );
        }
        const body = (await resp.json()) as { token: string };
        await use(body.token);
      } finally {
        await ctx.dispose();
      }
    },
    { scope: 'worker' },
  ],

  authenticatedContext: async ({ browser, authToken }, use) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${authToken}` },
    });
    await use(context);
    await context.close();
  },

  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
  },
});

export { expect } from '@playwright/test';
