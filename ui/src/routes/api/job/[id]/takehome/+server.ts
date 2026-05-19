/**
 * /api/job/[id]/takehome -- scaffold + manage the take-home working dir.
 *
 * GET    → return existing scaffold state (or null if not scaffolded)
 * POST   → scaffold (creates README + CHECKLIST + state.json)
 *          body: { budgetMinutes?, briefExcerpt? }
 * PATCH  → update state (timer status, milestones, budget changes)
 *          body: { status?, budgetMinutes?, milestone? }
 *
 * The email-reactor fires POST automatically when it classifies an
 * email as take-home. The user can call PATCH from the UI to mark
 * submitted / abandoned / add milestones.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  scaffoldTakeHome,
  findTakeHomeForJob,
  updateTakeHomeState,
  type TakeHomeState,
} from '$lib/server/takehome-scaffolder';
import { resolveJobAndProfile } from '$lib/server/job-resolver';

export const GET = wrap(
  'takehome',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) return { ok: false, error: 'Job not found' };
    const r = findTakeHomeForJob(resolved.job.id);
    if (!r) return { ok: true, exists: false };
    return { ok: true, exists: true, ...r };
  },
);

export const POST = wrap(
  'takehome',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) return { ok: false, error: 'Job not found' };
    const body = (await request.json().catch(() => ({}))) as {
      budgetMinutes?: number;
      briefExcerpt?: string;
    };
    const r = scaffoldTakeHome({
      jobId: resolved.job.id,
      profileId: resolved.profileId,
      company: resolved.job.company ?? '',
      role: resolved.job.role ?? '',
      briefExcerpt: body.briefExcerpt,
      budgetMinutes: body.budgetMinutes,
    });
    return { ok: true, ...r };
  },
);

export const PATCH = wrap(
  'takehome',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) return { ok: false, error: 'Job not found' };
    const body = (await request.json().catch(() => ({}))) as Partial<TakeHomeState> & {
      milestone?: string;
    };
    const patch: Partial<TakeHomeState> = {};
    if (body.status) patch.status = body.status;
    if (typeof body.budgetMinutes === 'number') patch.budgetMinutes = body.budgetMinutes;
    if (body.milestone) {
      // Append milestone instead of replacing.
      const existing = findTakeHomeForJob(resolved.job.id);
      const milestones = [
        ...(existing?.state.milestones ?? []),
        { ts: Date.now(), label: body.milestone },
      ];
      patch.milestones = milestones;
    }
    const next = updateTakeHomeState(
      resolved.profileId,
      resolved.job.company ?? '',
      resolved.job.role ?? '',
      patch,
    );
    if (!next) badRequest('Take-home scaffold not found — POST first');
    return { ok: true, state: next };
  },
);
