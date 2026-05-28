/**
 * /api/profile/cv-variants -- analyze which tailoring moves are converting.
 *
 * GET → CvVariantReport
 *
 * Pure-function, no LLM. Reads all jobs with PDFs + their .md sibling,
 * compares injected keywords vs the general CV baseline, correlates with
 * outcome buckets. Lets the user see "the X tailoring move converts;
 * the Y move doesn't" after 50+ applications.
 */

import { wrap } from '$lib/server/api-helpers';
import { analyzeCvVariants, preservationStats } from '$lib/server/cv-variant-analysis';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  if (q && getProfile(q)) {
    return q;
  }
  return getActiveProfileId();
}

export const GET = wrap('cv-variant-analysis', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  // Surface .md-sibling preservation stats -- explains "not enough data"
  // when most PDFs are pre-update and lack their .md source.
  return {
    ...analyzeCvVariants(profileId),
    preservation: preservationStats(profileId),
  };
});
