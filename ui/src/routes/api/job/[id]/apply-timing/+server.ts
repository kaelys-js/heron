/**
 * /api/job/[id]/apply-timing -- return the timing band for this job.
 *
 * GET → { firstSeen, daysSinceFirstSeen, band, label, advice }
 *
 * Used by the JobActions badges row to surface "Apply NOW" / "already
 * late" -- closes the application-timing gap that direct-apply users
 * historically can't see.
 */

import { wrap } from '$lib/server/api-helpers';
import { applyTimingFor } from '$lib/server/apply-timing';
import { resolveJobAndProfile } from '$lib/server/job-resolver';

export const GET = wrap(
  'apply-timing',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) return { ok: false, error: 'Job not found' };
    return { ok: true, ...applyTimingFor(resolved.profileId, resolved.job.url) };
  },
);
