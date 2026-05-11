/**
 * /api/patterns/suggestions — list + apply structured pattern recommendations.
 *
 * GET → spawns analyze-patterns.mjs, parses textual recs into structured
 *       suggestions, returns both.
 * POST → applies a single suggestion. Body: { id, op, payload }. Writes
 *        the target file with a .bak backup beside it.
 *
 * The dashboard surfaces these in /inbox and on a dedicated /patterns
 * page so the user can review the recommendations and one-click apply
 * the ones they trust.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  listSuggestions, applySuggestion, logSuggestionApplied,
  type StructuredSuggestion,
} from '$lib/server/pattern-suggestions';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  if (q && q !== 'all' && getProfile(q)) return q;
  return getActiveProfileId();
}

export const GET = wrap('pattern-suggestions', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  const r = listSuggestions(profileId);
  return {
    profileId,
    analysis: r.analysis,
    suggestions: r.suggestions,
  };
});

export const POST = wrap('pattern-suggestions', async ({ request, url }: { request: Request; url: URL }) => {
  const profileId = resolveProfileId(url);
  const body = (await request.json().catch(() => ({}))) as Partial<StructuredSuggestion>;
  if (!body?.op) badRequest('op required');
  const result = applySuggestion(body as StructuredSuggestion, profileId);
  if (result.ok) {
    logSuggestionApplied(body as StructuredSuggestion, result.summary ?? '');
  }
  return result;
});
