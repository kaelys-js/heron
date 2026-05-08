/**
 * Per-job interview prep — cached + on-demand.
 *
 *   GET /api/job/[id]/interview-prep
 *     → returns the persisted file at interview-prep/{slug}.md if one exists,
 *       or 404 with { exists: false } so the UI can show a Generate CTA.
 *
 *   POST /api/job/[id]/interview-prep
 *     → spawns generateInterviewPrep(), persists the result, returns the
 *       fresh markdown. Re-runs OK — overwrites the persisted file.
 *
 * Auto-firing on status→Interview is handled by `auto-interview-prep.ts`
 * (a bus listener). This endpoint is the manual escape hatch.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { generateInterviewPrep, readPersistedInterviewPrep } from '$lib/server/interview';
import { logEvent, reportServerError } from '$lib/server/events';

export const GET = wrap('interview-prep', async ({ params }: { params: { id: string } }) => {
  const job = loadAllJobs().find((j) => j.id === params.id);
  if (!job) badRequest('Job not found: ' + params.id);
  const cached = readPersistedInterviewPrep(job!.id);
  if (cached) return { exists: true, content: cached };
  return { exists: false };
});

export const POST = wrap('interview-prep', async ({ params, request }: { params: { id: string }; request: Request }) => {
  const job = loadAllJobs().find((j) => j.id === params.id);
  if (!job) badRequest('Job not found: ' + params.id);
  if (!job!.reportFile) badRequest('Job has no deep evaluation report yet — run oferta first.');
  const body = (await request.json().catch(() => ({}))) as { archetype?: string };

  logEvent('interview-prep', 'Generating interview prep', {
    level: 'info',
    category: 'task',
    message: (job!.company || '?') + ' · ' + (job!.role || '?'),
  });

  try {
    const md = await generateInterviewPrep(job!.reportFile, body.archetype, job!.id);
    logEvent('interview-prep', 'Interview prep ready', {
      level: 'success',
      category: 'task',
      message: (job!.company || '?') + ' · ' + (job!.role || '?'),
    });
    return { ok: true, content: md };
  } catch (err) {
    reportServerError('interview-prep', 'Generation failed', err, { category: 'task' });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
