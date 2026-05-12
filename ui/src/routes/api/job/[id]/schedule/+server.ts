/**
 * /api/job/[id]/schedule — set / read the scheduled interview time.
 *
 * GET → current schedule entry (or null)
 * POST body: { scheduledAt: number (ms epoch), stage?, format?,
 *              interviewers?, notes? }
 *
 * Used by the JobActions menu's "Schedule interview" action (and by the
 * email-reactor in a future iteration when it parses a calendar invite).
 * Once set, the interview-reminder daemon emits T-30min and T-24h pings
 * via the standard activity-feed → SSE → OS notification pipeline.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { getSchedule, setSchedule, type ScheduleEntry } from '$lib/server/interview-schedule';
import { resolveJobAndProfile } from '$lib/server/job-resolver';

export const GET = wrap(
  'interview-schedule',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) return { ok: false, error: 'Job not found' };
    const entry = getSchedule(resolved.profileId, resolved.job.id);
    return { ok: true, entry };
  },
);

export const POST = wrap(
  'interview-schedule',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) return { ok: false, error: 'Job not found' };
    const body = (await request.json().catch(() => ({}))) as Partial<ScheduleEntry>;
    if (typeof body.scheduledAt !== 'number') badRequest('scheduledAt (ms epoch) required');
    const entry = setSchedule(resolved.profileId, {
      jobId: resolved.job.id,
      scheduledAt: body.scheduledAt!,
      stage: body.stage ?? resolved.job.status,
      format: body.format,
      interviewers: body.interviewers,
      notes: body.notes,
    });
    return { ok: true, entry };
  },
);
