/** Interviewer panel for a single job. GET /api/job/[id]/interviewers lists
 *  every interviewer (slug, name, title, stage, scheduledAt, dossierPath,
 *  questionsPath, thankYouPath, notes, updatedAt). POST upserts by slug
 *  (slug derived from name unless supplied); body: { name, title?, email?,
 *  linkedinUrl?, twitterUrl?, githubUrl?, stage, scheduledAt?, notes? }.
 *  Remove + dossier + questions + thank-you live as [slug]/* siblings. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import {
  listInterviewers,
  upsertInterviewer,
  type Interviewer,
  type InterviewerStage,
} from '$lib/server/interviewers';
import { touchJob } from '$lib/server/stage-state';
import { logEvent } from '$lib/server/events';

const VALID_STAGES: InterviewerStage[] = [
  'recruiter-screen',
  'hiring-manager-screen',
  'tech-screen',
  'take-home',
  'onsite',
  'final-round',
  'reference',
  'unknown',
];

export const GET = wrap(
  'interviewers',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    return { ok: true, interviewers: listInterviewers(job.id, profileId) };
  },
);

export const POST = wrap(
  'interviewers',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => null)) as Partial<Interviewer> | null;
    if (!body || !body.name) badRequest('name is required');
    const stage: InterviewerStage = VALID_STAGES.includes(body.stage as InterviewerStage)
      ? (body.stage as InterviewerStage)
      : 'unknown';
    const interviewer = upsertInterviewer(
      job.id,
      {
        slug: body.slug,
        name: body.name!,
        title: body.title,
        email: body.email,
        linkedinUrl: body.linkedinUrl,
        twitterUrl: body.twitterUrl,
        githubUrl: body.githubUrl,
        stage,
        scheduledAt: body.scheduledAt,
        dossierPath: body.dossierPath,
        questionsPath: body.questionsPath,
        thankYouPath: body.thankYouPath,
        notes: body.notes,
      },
      profileId,
    );
    // Adding/updating an interviewer counts as a "touch" -- keeps the
    // auto-ghost detector from flagging the job as silent.
    touchJob(job.id, profileId);
    logEvent('interviewers', 'Interviewer upserted: ' + interviewer.name, {
      level: 'info',
      category: 'application',
      message: (job.company || '?') + ' / ' + interviewer.stage,
    });
    return { ok: true, interviewer };
  },
);
