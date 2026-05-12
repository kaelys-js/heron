/**
 * DELETE /api/job/[id]/interviewers/[slug] — remove one interviewer.
 * GET    /api/job/[id]/interviewers/[slug] — fetch a single interviewer record.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { getInterviewer, removeInterviewer } from '$lib/server/interviewers';
import { logEvent } from '$lib/server/events';

export const GET = wrap(
  'interviewer',
  async ({ params, url }: { params: { id: string; slug: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const interviewer = getInterviewer(job.id, params.slug, profileId);
    if (!interviewer) badRequest('Interviewer not found: ' + params.slug);
    return { ok: true, interviewer };
  },
);

export const DELETE = wrap(
  'interviewer',
  async ({ params, url }: { params: { id: string; slug: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const removed = removeInterviewer(job.id, params.slug, profileId);
    if (!removed) badRequest('Interviewer not found: ' + params.slug);
    logEvent('interviewers', 'Interviewer removed: ' + params.slug, {
      level: 'info',
      category: 'application',
      message: job.company ?? '?',
    });
    return { ok: true };
  },
);
