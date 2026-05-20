/** /api/job/[id]/interview-prep -- per-job interview prep, cached + on-demand.
 *  GET returns the persisted file at interview-prep/{slug}.md if one exists,
 *  else 404 + { exists: false } so the UI shows a Generate CTA. POST spawns
 *  generateInterviewPrep(), persists, returns the markdown; re-runs overwrite.
 *  Auto-firing on status→Interview lives in auto-interview-prep.ts (bus
 *  listener) -- this endpoint is the manual escape hatch. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { generateInterviewPrep, readPersistedInterviewPrep } from '$lib/server/interview';
import { logEvent, reportServerError } from '$lib/server/events';

export const GET = wrap(
  'interview-prep',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const cached = readPersistedInterviewPrep(profileId, job.id);
    if (cached) return { exists: true, content: cached };
    return { exists: false };
  },
);

export const POST = wrap(
  'interview-prep',
  async ({ params, request, url }: { params: { id: string }; request: Request; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    if (!job.reportFile) badRequest('Job has no deep evaluation report yet — run evaluate first.');
    const body = (await request.json().catch(() => ({}))) as { archetype?: string };

    logEvent('interview-prep', 'Generating interview prep', {
      level: 'info',
      category: 'task',
      message: (job.company || '?') + ' · ' + (job.role || '?'),
    });

    try {
      // Pass the job's profileId so report + CV + persistedPath all resolve to
      // this job's profile, not the active one.
      const md = await generateInterviewPrep(profileId, job.reportFile, body.archetype, job.id);
      logEvent('interview-prep', 'Interview prep ready', {
        level: 'success',
        category: 'task',
        message: (job.company || '?') + ' · ' + (job.role || '?'),
      });
      return { ok: true, content: md };
    } catch (err) {
      reportServerError('interview-prep', 'Generation failed', err, { category: 'task' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
