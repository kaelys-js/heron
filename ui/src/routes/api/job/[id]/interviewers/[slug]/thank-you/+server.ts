/**
 * POST /api/job/[id]/interviewers/[slug]/thank-you
 *
 * Generate a personalised thank-you note after the interview. The note
 * pulls in:
 *   • What the interviewer's likely focus was (their stage + title)
 *   • A discussion-point hook the user supplies in the body
 *     (`talkingPoints`) — usually 1-2 things that came up in the call
 *   • One concrete callback connecting their challenge to a story
 *     from the user's CV
 *
 * Output: `interview-prep/{company}-{slug}-thank-you.md` written by the
 * `thank-you` mode. The Interviewer record's `thankYouPath` field is
 * updated, which clears the "thank-you owed" Inbox card.
 */

import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';
import { getInterviewer, upsertInterviewer } from '$lib/server/interviewers';
import { touchJob } from '$lib/server/stage-state';

const TIMEOUT_MS = 90_000;

function spawnThankYou(args: {
  company: string;
  role: string;
  profileId: string;
  jobId: string;
  interviewerSlug: string;
  interviewerName: string;
  interviewerTitle?: string;
  stage: string;
  talkingPoints?: string;
  tone?: 'formal' | 'friendly' | 'enthusiastic';
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
      talkingPoints: args.talkingPoints ?? '',
      tone: args.tone ?? 'friendly',
    };
    const prompt = '/' + CLI_NAMESPACE + ' thank-you ' + JSON.stringify(payload);
    try {
      swapProfileSymlinks(args.profileId);
    } catch {}
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env, THANK_YOU_INPUT: JSON.stringify(payload) },
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
      reject(new Error('thank-you timeout after ' + TIMEOUT_MS + 'ms'));
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

function parseThankYouPath(stdout: string): string | undefined {
  const m = /THANK_YOU_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap(
  'thank-you',
  async ({
    params,
    url,
    request,
  }: {
    params: { id: string; slug: string };
    url: URL;
    request: Request;
  }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const interviewer = getInterviewer(job.id, params.slug, profileId);
    if (!interviewer) badRequest('Interviewer not found: ' + params.slug);
    const body = (await request.json().catch(() => ({}))) as {
      talkingPoints?: string;
      tone?: 'formal' | 'friendly' | 'enthusiastic';
    };
    try {
      const { stdout } = await spawnThankYou({
        company: job.company ?? '',
        role: job.role ?? '',
        profileId,
        jobId: job.id,
        interviewerSlug: interviewer!.slug,
        interviewerName: interviewer!.name,
        interviewerTitle: interviewer!.title,
        stage: interviewer!.stage,
        talkingPoints: body.talkingPoints,
        tone: body.tone,
      });
      const thankYouPath = parseThankYouPath(stdout);
      if (thankYouPath) {
        upsertInterviewer(job.id, { ...interviewer!, thankYouPath }, profileId);
        touchJob(job.id, profileId);
      }
      logEvent('thank-you', 'Thank-you note generated', {
        level: 'success',
        category: 'application',
        message: thankYouPath ?? '(no path emitted)',
      });
      return { ok: true, thankYouPath };
    } catch (err) {
      reportServerError('thank-you', 'Thank-you generation failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
