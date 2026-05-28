/**
 * Lost Pixel -- visual regression for the SvelteKit dashboard.
 *
 * Strategy: a single shared bearer token is minted once at config-load
 * time via /api/auth/e2e-login (the same endpoint Playwright's E2E
 * fixtures use; 404s outside CI on HERON_E2E_DATA_DIR-less
 * environments). Before each page screenshot, the token is injected
 * as an Authorization header on the Playwright context + the page is
 * reloaded so the SSR pass sees the auth header. Without this, every
 * auth-gated route 302s to /login and Lost Pixel screenshots the
 * login page instead of the target route.
 *
 * Time freeze: `beforeScreenshot` installs an addInitScript that
 * overrides Date with a fixed epoch (2026-06-02T12:00:00Z) before any
 * UI code reads `new Date()` / `Date.now()` /
 * `Date.prototype.toLocaleDateString()`. Eliminates the "Friday,
 * May 22, 2026" / "just now" relative-time drift that would otherwise
 * blow the 5% diff threshold on every CI run. The DYNAMIC_MASKS list
 * below stays in place as belt-and-braces -- a few SSR'd time strings
 * are rendered server-side BEFORE the browser's Date is mocked, so
 * masking those data-testid'd elements catches the residual drift.
 *
 * Routes:
 *   - PUBLIC:  /login, /signup (no auth needed)
 *   - AUTH:    /inbox, /queue, /autopilot, /profile, /profiles,
 *              /runtimes, /agents
 *
 * Breakpoints: 375 (mobile), 768 (tablet), 1280 (desktop). Three
 * widths per route covers the responsive matrix without exploding
 * baseline count.
 *
 * Diff threshold: 5% (anti-alias / font-render tolerance). Real UI
 * regressions sit well above this.
 */

import type { CustomProjectConfig } from 'lost-pixel';
import { PREVIEW_BASE_URL } from './e2e/_helpers/preview-server';

const BASE_URL = PREVIEW_BASE_URL;

const PUBLIC_ROUTES = [
  { path: '/login', name: 'login' },
  { path: '/signup', name: 'signup' },
] as const;

const AUTH_ROUTES = [
  { path: '/inbox', name: 'inbox' },
  { path: '/queue', name: 'queue' },
  { path: '/autopilot', name: 'autopilot' },
  { path: '/profile', name: 'profile' },
  { path: '/profiles', name: 'profiles' },
  { path: '/runtimes', name: 'runtimes' },
  { path: '/agents', name: 'agents' },
] as const;

const BREAKPOINTS = [375, 768, 1280];

const AUTH_NAMES = new Set(AUTH_ROUTES.map((r) => r.name));

// Token cache -- minted lazily on first auth-route shot, reused
// thereafter. Lost Pixel runs all shots in one Playwright session,
// so caching here is process-lifetime.
let cachedAuthToken: string | null = null;

async function mintAuthToken(page: import('playwright-core').Page): Promise<string> {
  if (cachedAuthToken) {
    return cachedAuthToken;
  }
  const resp = await page.request.post(`${BASE_URL}/api/auth/e2e-login`, {
    data: { userId: 'u_e2e' },
    failOnStatusCode: false,
  });
  if (!resp.ok()) {
    throw new Error(
      `lost-pixel: /api/auth/e2e-login returned ${resp.status()}. ` +
        'Confirm HERON_E2E_DATA_DIR is set on the preview server + ' +
        'seed-lighthouse-user.mjs has run.',
    );
  }
  const body = (await resp.json()) as { token?: unknown };
  if (typeof body.token !== 'string' || body.token.length === 0) {
    throw new Error(
      'lost-pixel: /api/auth/e2e-login response missing or empty `token`. ' +
        'Confirm the auth-bypass endpoint is wired + the e2e seed populated u_e2e.',
    );
  }
  cachedAuthToken = body.token;
  return cachedAuthToken;
}

// Masks for transient/dynamic UI that would otherwise trip the 5% diff
// gate on every CI run. Targets:
//   - Sonner toast notifications (timestamped error reports from
//     background scans).
//   - Time / date elements (Topbar dates, "Friday, May 22, 2026"
//     style headers).
//   - The "scan running" / autopilot-status pulse indicator.
//   - Stats cards' "X jobs" counters which change as autopilot finds
//     new postings.
const DYNAMIC_MASKS = [
  // Sonner toast root + any toast container
  { selector: '[data-sonner-toaster]' },
  { selector: '[data-sonner-toast]' },
  { selector: '[role="status"][aria-live]' },
  // Time elements + greeting line
  { selector: 'time' },
  { selector: '[data-testid="topbar-date"]' },
  { selector: '[data-testid="autopilot-status"]' },
  // Inbox greeting + stats card numbers (time-of-day + data-driven)
  { selector: '[data-testid="inbox-greeting"]' },
  { selector: '[data-testid="inbox-stat-value"]' },
  // Activity feed (relative "just now" timestamps)
  { selector: '[data-testid="activity-feed"]' },
  // Notification badge count (changes with backend activity)
  { selector: '[data-testid="notifications-bell"] [class*="rounded-full"]' },
];

// Per-page threshold MUST be set explicitly. Lost Pixel's Zod schema for
// pageShots.pages[].threshold has `z.number().default(0)` which silently
// OVERRIDES the config-level `threshold: 0.05` -- pages WITHOUT an explicit
// threshold land at 0 (any pixel diff fails). Verified by tracing
// shotItem.threshold at compareImages-call time (was 0, expected 0.05).
const PAGE_THRESHOLD = 0.05;

const config: CustomProjectConfig = {
  pageShots: {
    pages: [
      ...PUBLIC_ROUTES.map((r) => ({
        path: r.path,
        name: r.name,
        breakpoints: BREAKPOINTS,
        // Wait 6s before screenshot so Sonner toasts auto-dismiss
        // (default duration 5s) + any lazy data-loads settle.
        waitBeforeScreenshot: 6000,
        threshold: PAGE_THRESHOLD,
        mask: DYNAMIC_MASKS,
      })),
      ...AUTH_ROUTES.map((r) => ({
        path: r.path,
        name: r.name,
        breakpoints: BREAKPOINTS,
        waitBeforeScreenshot: 6000,
        threshold: PAGE_THRESHOLD,
        mask: DYNAMIC_MASKS,
      })),
    ],
    baseUrl: BASE_URL,
  },
  imagePathBaseline: './lost-pixel/baseline',
  imagePathCurrent: './lost-pixel/current',
  imagePathDifference: './lost-pixel/difference',
  threshold: 0.05,
  failOnDifference: true,

  /**
   * Freeze Date + (for auth routes) inject the bearer token before
   * each screenshot.
   *
   * Lost Pixel calls beforeScreenshot AFTER navigating to the page's
   * `path`. So when the page is /inbox + unauthed, the browser is
   * actually at /login (302 chased), and the Date in the browser is
   * whatever wall-clock it started with. We:
   *   1. addInitScript a FrozenDate override. Registers on the
   *      context, fires on every FUTURE navigation.
   *   2. For auth routes: mint/reuse the token + set the bearer
   *      header on the context.
   *   3. ALWAYS re-navigate to the target route so the addInitScript
   *      (which doesn't apply retroactively to the initial nav) takes
   *      effect on the screenshot's actual page state.
   *
   * args.id strips Lost Pixel's breakpoint suffix already (the `name`
   * we pass in the pageShots is what surfaces as `id`).
   */
  beforeScreenshot: async (page, args) => {
    const name = args.id ?? args.shotName ?? '';
    // Lost Pixel 3.x suffixes shot names with `__[w<width>px]` for the
    // breakpoint variants (e.g. `inbox__[w1280px]`). Strip the
    // bracketed-width suffix to get the canonical base name.
    const baseName = name.replace(/__\[w\d+px\]$/, '');

    // FrozenDate: override globalThis.Date so every call to
    // `new Date()` / `Date.now()` / methods on a no-arg Date instance
    // returns the same fixed epoch. Calls WITH explicit arguments
    // (e.g. `new Date('2024-01-01')`) still parse normally so any
    // hard-coded timestamps in the UI render correctly.
    await page.addInitScript(() => {
      const FIXED_MS = 1748880000000; // 2026-06-02T12:00:00Z, stable epoch
      const RealDate = Date;
      class FrozenDate extends RealDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super(FIXED_MS);
          } else {
            super(...(args as ConstructorParameters<typeof Date>));
          }
        }
        static now(): number {
          return FIXED_MS;
        }
      }
      (globalThis as { Date: unknown }).Date = FrozenDate;
    });

    const isAuthRoute = AUTH_NAMES.has(baseName as (typeof AUTH_ROUTES)[number]['name']);

    if (isAuthRoute) {
      const token = await mintAuthToken(page);
      await page.context().setExtraHTTPHeaders({ Authorization: `Bearer ${token}` });
    }

    // Re-navigate so the FrozenDate init-script fires on the page
    // that gets screenshotted. Both PUBLIC and AUTH shots need this
    // re-nav -- the public-route case is for the time freeze; the
    // auth-route case is additionally for the bearer-header SSR pass.
    const route = isAuthRoute
      ? AUTH_ROUTES.find((r) => r.name === baseName)
      : PUBLIC_ROUTES.find((r) => r.name === baseName);
    if (route) {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
      // Let lazy chunks + sonner-toast portal settle before the shot.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }
  },
};

export default config;
