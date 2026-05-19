/**
 * Lost Pixel -- self-hosted visual regression testing.
 *
 * HP4 (Lost Pixel variant) -- captures snapshots of canonical
 * dashboard routes against `pnpm preview` (prod build), compares to
 * baselines stored in git, posts a sticky PR comment with the diff.
 *
 * Why Lost Pixel over Argos:
 *   - Self-hosted: no external account, no SaaS billing risk
 *   - Baselines live in git: full audit trail of what changed when
 *   - Workflow uploads diff images as Actions artifacts on regression
 *
 * Baselines: stored under `.lostpixel/baseline/`. Commit them
 * deliberately. On a "design refresh" PR that legitimately changes
 * many visuals, add the `accept-snapshots` label -- the workflow
 * regenerates the baselines on that PR and commits them back.
 *
 * Threshold: 0.1 (10% pixel difference) -- tighter than Lost Pixel's
 * default 0.5. Heron's UI is dense; even a 5-pixel shift on a status
 * badge matters.
 *
 * Routes selected to mirror the README screenshot grid (so the same
 * visuals that ship in marketing also gate at CI).
 */
import type { CustomProjectConfig } from 'lost-pixel';

export const config: CustomProjectConfig = {
  pageShots: {
    pages: [
      // Auth -- the cold-start screen most contributors see first
      { path: '/login', name: 'login' },

      // Dashboard core
      { path: '/inbox', name: 'inbox' },
      { path: '/queue', name: 'queue' },
      { path: '/autopilot', name: 'autopilot' },
      { path: '/patterns', name: 'patterns' },

      // Settings
      { path: '/settings', name: 'settings' },
      { path: '/profile', name: 'profile' },
      { path: '/runtimes', name: 'runtimes' },
    ],
    baseUrl: 'http://localhost:4173',
    breakpoints: [
      // Mobile (iPhone 16 Pro) -- gate the responsive layout
      375,
      // Tablet
      768,
      // Desktop (most reviewers)
      1440,
    ],
  },

  // CI infrastructure
  generateOnly: process.env.LOST_PIXEL_MODE === 'generate-only',
  imagePathBaseline: '.lostpixel/baseline',
  imagePathCurrent: '.lostpixel/current',
  imagePathDifference: '.lostpixel/difference',
  failOnDifference: true,
  failOnMissingBaselines: false, // First run on a new page is OK
  // 10% pixel difference threshold -- adjust per route via per-page config
  // if a particularly dense view needs slack.
  threshold: 0.1,
  // Wait for SvelteKit hydration before capturing
  waitBeforeScreenshot: 1500,
  // Capture viewports separately + name them so the diff is readable
  shotConcurrency: 2,
  compareConcurrency: 4,
  timeouts: {
    fetchStories: 30_000,
    loadState: 30_000,
    networkRequests: 30_000,
  },
};
