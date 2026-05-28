/**
 * POST /api/job/[id]/stage   { status, note?, dueAt?, dueKind? }
 *   → records a stage transition + (optionally) sets the next action
 * GET  /api/job/[id]/stage
 *   → returns the full stage state for this job
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { recordTransition, setNextAction, getStageState } from '$lib/server/stage-state';
import type { NextActionKind } from '$lib/server/stage-state';
import { logEvent } from '$lib/server/events';
import type { Status } from '$lib/types';

export const GET = wrap('stage', async ({ params, url }: { params: { id: string }; url: URL }) => {
  const resolved = resolveJobAndProfile(params.id, url);
  if (!resolved) {
    badRequest('Job not found: ' + params.id);
  }
  const { job, profileId } = resolved!;
  const state = getStageState(job.id, profileId);
  return { ok: true, state: state ?? null };
});

export const POST = wrap(
  'stage',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) {
      badRequest('Job not found: ' + params.id);
    }
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => null)) as {
      status?: Status;
      note?: string;
      dueAt?: number;
      dueKind?: NextActionKind;
      dueNote?: string;
      interviewerName?: string;
    } | null;
    if (!body || !body.status) {
      badRequest('status is required');
    }

    const state = recordTransition(job.id, body.status!, {
      profileId,
      note: body.note,
    });

    if (body.dueAt && body.dueKind) {
      setNextAction(
        job.id,
        {
          dueAt: body.dueAt,
          kind: body.dueKind,
          note: body.dueNote,
          interviewerName: body.interviewerName,
        },
        profileId,
      );
    }

    logEvent('stage', `${job.company || '?'} → ${body.status}`, {
      level: 'info',
      category: 'application',
      message: body.note ?? '',
    });
    return { ok: true, state };
  },
);
