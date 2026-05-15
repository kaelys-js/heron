/**
 * POST /api/job/[id]/interviewers/[slug]/questions
 *
 * Generate the "10 questions to ask this interviewer" file. These are
 * calibrated to the interviewer's stage (recruiter-screen ≠ tech-screen
 * ≠ onsite-final) AND to their background (engineering lead gets
 * architecture questions; PM gets prioritisation questions).
 *
 * Output: `interview-prep/{company}-{slug}-questions.md` written by the
 * `questions-to-ask` mode. The Interviewer record's `questionsPath`
 * field is updated on completion.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';
import { getInterviewer, upsertInterviewer } from '$lib/server/interviewers';
import { touchJob } from '$lib/server/stage-state';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
const TIMEOUT_MS = 120_000;

function spawnQuestions(args: {
  company: string;
  role: string;
  profileId: string;
  jobId: string;
  interviewerSlug: string;
  interviewerName: string;
  interviewerTitle?: string;
  stage: string;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = {
      jobId: args.jobId,
      company: args.company,
      role: args.role,
      interviewerSlug: args.interviewerSlug,
      interviewerName: args.interviewerName,
      interviewerTitle: args.interviewerTitle,
      stage: args.stage,
    };

    const { child: p } = spawnAgentWithMode('questions-to-ask', JSON.stringify(payload), {
      profileId: args.profileId,
      env: { QUESTIONS_INPUT: JSON.stringify(payload) },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {}
      reject(new Error('questions-to-ask timeout after ' + TIMEOUT_MS + 'ms'));
    }, TIMEOUT_MS);
    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      else resolveP({ stdout, stderr });
    });
  });
}

function parseQuestionsPath(stdout: string): string | undefined {
  const m = /QUESTIONS_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap(
  'questions',
  async ({ params, url }: { params: { id: string; slug: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const interviewer = getInterviewer(job.id, params.slug, profileId);
    if (!interviewer) badRequest('Interviewer not found: ' + params.slug);
    try {
      const { stdout } = await spawnQuestions({
        company: job.company ?? '',
        role: job.role ?? '',
        profileId,
        jobId: job.id,
        interviewerSlug: interviewer!.slug,
        interviewerName: interviewer!.name,
        interviewerTitle: interviewer!.title,
        stage: interviewer!.stage,
      });
      const questionsPath = parseQuestionsPath(stdout);
      if (questionsPath) {
        upsertInterviewer(job.id, { ...interviewer!, questionsPath }, profileId);
        touchJob(job.id, profileId);
      }
      logEvent('questions', 'Questions-to-ask generated', {
        level: 'success',
        category: 'application',
        message: questionsPath ?? '(no path emitted)',
      });
      return { ok: true, questionsPath };
    } catch (err) {
      reportServerError('questions', 'Question generation failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
