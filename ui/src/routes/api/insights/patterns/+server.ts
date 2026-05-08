/**
 * Insights endpoint — backs the /insights page.
 *
 *   GET             → cached snapshot (≤10min stale OK)
 *   GET ?fresh=1    → re-spawn analyze-patterns.mjs (slow, costs nothing,
 *                      typically ~1s on a small tracker)
 */

import { wrap } from '$lib/server/api-helpers';
import { getPatterns } from '$lib/server/analyze-patterns';

export const GET = wrap('insights-patterns', async ({ url }: { url: URL }) => {
  const fresh = url.searchParams.get('fresh') === '1';
  return await getPatterns({ force: fresh });
});
