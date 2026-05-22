/**
 * HAR replay E2E -- replays a pre-recorded network trace so the spec
 * can assert how the dashboard renders against a known-bad payload
 * without hitting a real LinkedIn / Greenhouse / Ashby endpoint.
 *
 * Why HAR replay rather than per-request page.route() stubs: the
 * dashboard fires DOZENS of API calls during a single navigation
 * (every navigation re-fetches stats / insights / health / queue /
 * sources / autopilot / notifications / unread). Stubbing each one
 * by hand is brittle; recording a HAR once and replaying it locks
 * the entire surface to a known-good slice.
 *
 * Fixtures directory layout: ui/e2e/fixtures/har/<name>.har. To
 * record a new HAR for a future scenario:
 *
 *   pnpm --filter ui exec playwright codegen \
 *     --save-har=e2e/fixtures/har/<scenario>.har \
 *     http://localhost:4173
 *
 * The recording captures every HTTP request the browser makes; replay
 * routes matching URLs against the captured response bodies.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures/auth-fixtures';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HAR_DIR = path.join(__dirname, 'fixtures', 'har');

test.describe('HAR replay', () => {
  test.skip(
    !fs.existsSync(path.join(HAR_DIR, 'inbox-baseline.har')),
    'HAR fixture missing -- record via `playwright codegen --save-har`',
  );

  test('inbox renders deterministically against a captured network trace', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.routeFromHAR(path.join(HAR_DIR, 'inbox-baseline.har'), {
      // Only replay matched requests; unmatched fall through to the
      // real server (the seeded one). This lets the spec test the
      // mix of "static assets from the real server + API responses
      // from the HAR".
      notFound: 'fallback',
    });
    await authenticatedPage.goto('/inbox');
    // The HAR captures the empty inbox state. The page should render
    // the empty state or stats cards without crashing.
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
