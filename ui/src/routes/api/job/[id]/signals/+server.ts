/**
 * GET /api/job/[id]/signals
 *
 * Returns dysfunctionSignal + remoteReality for a single job. Cheap --
 * runs server-side over the scan-history TSV + the deep-eval report.
 * No agent spawn. Surfaces on the job page as warning badges.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { dysfunctionSignal, remoteReality } from '$lib/server/job-signals';

export const GET = wrap(
  'signals',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) {
      badRequest('Job not found: ' + params.id);
    }
    const { job, profileId } = resolved!;
    return {
      ok: true,
      dysfunction: dysfunctionSignal(job, profileId),
      remote: remoteReality(job, profileId),
    };
  },
);
