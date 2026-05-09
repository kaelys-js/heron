/**
 * POST /api/portals/title-filter
 *
 * Patches `title_filter.positive` + `title_filter.negative` in portals.yml.
 * Used by the onboarding wizard's targeting step. Preserves every other
 * field (tracked_companies, search_queries, sources, seniority_boost).
 *
 * If portals.yml doesn't exist yet, the canonical template at
 * `templates/portals.example.yml` is copied first so the user inherits the
 * curated 100+-company starter list.
 *
 * Request:  { positive: string[]; negative: string[] }
 * Response: { snapshot: PortalsSnapshot }
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { writePortalsTitleFilter } from '$lib/server/portals';
import { logEvent } from '$lib/server/events';

export const POST = wrap('portals-title-filter', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as
    | { positive?: unknown; negative?: unknown }
    | null;
  if (!body) badRequest('expected JSON body with { positive: string[], negative: string[] }');
  const { positive, negative } = body;
  if (!Array.isArray(positive) || !Array.isArray(negative)) {
    badRequest('positive and negative must both be arrays of strings');
  }
  // Type-narrow + strip empties + dedupe.
  const cleanPos = [...new Set(positive.map((x) => String(x).trim()).filter(Boolean))];
  const cleanNeg = [...new Set(negative.map((x) => String(x).trim()).filter(Boolean))];
  if (cleanPos.length === 0) {
    badRequest('positive must include at least one keyword');
  }
  const snapshot = writePortalsTitleFilter(cleanPos, cleanNeg);
  logEvent('portals-title-filter', 'Title filter updated', {
    level: 'info',
    category: 'user',
    message:
      cleanPos.length + ' positive · ' + cleanNeg.length + ' negative · ' +
      (snapshot.exists ? 'wrote portals.yml' : 'bootstrap from template'),
  });
  return { snapshot };
});
