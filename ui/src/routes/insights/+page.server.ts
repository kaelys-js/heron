/**
 * Insights page loader. Pulls the cached pattern-analysis snapshot so the
 * page renders instantly. Page exposes a "Refresh" button that hits
 * /api/insights/patterns?fresh=1 for a live re-run.
 */

import { getPatterns } from '$lib/server/analyze-patterns';

export async function load() {
  let patterns: Awaited<ReturnType<typeof getPatterns>> | null = null;
  let loadError: string | null = null;
  try {
    patterns = await getPatterns();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  return { patterns, loadError };
}
