/**
 * POST /api/job/[id]/interviewers/[slug]/dossier
 *
 * Spawn the per-interviewer dossier mode.
 *
 * The system already has a job-wide /api/job/[id]/dossier endpoint (calls
 * the `pre-call-dossier` mode and writes ONE file covering the whole panel).
 * This sibling endpoint instead generates a PER-INTERVIEWER deep-research
 * brief — recent talks, papers, projects, opinions on technical topics,
 * the 3 stories from the user's CV that match THIS interviewer's
 * background, and 7 questions calibrated to their role.
 *
 * Output: `interview-prep/{company}-{interviewer-slug}-dossier.md` and the
 * Interviewer record's `dossierPath` field gets updated.
 *
 * Cost: 4-8 web requests + one Claude pass = 90-150s per dossier.
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

const TIMEOUT_MS = 240_000;

function spawnInterviewerDossier(args: {
  company: string;
  role: string;
  profileId: string;
  jobId: string;
  interviewerSlug: string;
  interviewerName: string;
  interviewerTitle?: string;
  linkedinUrl?: string;
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
      linkedinUrl: args.linkedinUrl,
      stage: args.stage,
    };
    const prompt = '/' + CLI_NAMESPACE + ' interviewer-dossier ' + JSON.stringify(payload);
    try {
      swapProfileSymlinks(args.profileId);
    } catch {}
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env, INTERVIEWER_DOSSIER_INPUT: JSON.stringify(payload) },
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
      reject(new Error('interviewer-dossier timeout after ' + TIMEOUT_MS + 'ms'));
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

function parseDossierPath(stdout: string): string | undefined {
  const m = /DOSSIER_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap(
  'interviewer-dossier',
  async ({ params, url }: { params: { id: string; slug: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const interviewer = getInterviewer(job.id, params.slug, profileId);
    if (!interviewer) badRequest('Interviewer not found: ' + params.slug);

    logEvent('interviewer-dossier', 'Generating dossier · ' + interviewer!.name, {
      level: 'info',
      category: 'application',
      message: (job.company || '?') + ' · ' + interviewer!.stage,
    });

    try {
      const { stdout } = await spawnInterviewerDossier({
        company: job.company ?? '',
        role: job.role ?? '',
        profileId,
        jobId: job.id,
        interviewerSlug: interviewer!.slug,
        interviewerName: interviewer!.name,
        interviewerTitle: interviewer!.title,
        linkedinUrl: interviewer!.linkedinUrl,
        stage: interviewer!.stage,
      });
      const dossierPath = parseDossierPath(stdout);
      if (dossierPath) {
        upsertInterviewer(job.id, { ...interviewer!, dossierPath }, profileId);
        touchJob(job.id, profileId);
      }
      logEvent('interviewer-dossier', 'Dossier ready', {
        level: 'success',
        category: 'application',
        message: dossierPath ?? '(no path emitted)',
      });
      return { ok: true, dossierPath };
    } catch (err) {
      reportServerError('interviewer-dossier', 'Dossier generation failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
