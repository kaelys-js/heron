/**
 * /api/job/[id]/dossier -- spawn the pre-call-dossier Claude mode.
 *
 * POST body: { stage, interviewers: [{name, role?, linkedinUrl?}] }
 *
 * Generates the 1-pager the user reads 30 minutes before the call:
 * who the interviewers are, what to ask each, the 3 stories to lead
 * with, the 5 questions to ask back, red flags to listen for.
 *
 * Cost: ~6 web requests + one Claude pass = 60-120s per dossier. Cache
 * via filename (slug + stage + ts) -- multiple dossiers for the same
 * job at different stages.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
type DossierInput = {
  stage: 'PhoneScreen' | 'Technical' | 'TakeHome' | 'Onsite' | 'Final';
  interviewers: Array<{ name: string; role?: string; linkedinUrl?: string }>;
};

function spawnDossier(
  args: DossierInput & { company: string; role: string; profileId: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const promptInput = {
      company: args.company,
      role: args.role,
      stage: args.stage,
      interviewers: args.interviewers,
    };

    const { child: p } = spawnAgentWithMode('pre-call-dossier', JSON.stringify(promptInput), {
      profileId: args.profileId,
      env: { DOSSIER_INPUT: JSON.stringify(promptInput) },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      else resolve({ stdout, stderr });
    });
  });
}

function parseDossierStdout(stdout: string): {
  dossierPath?: string;
  interviewersResearched?: number;
  questionsGenerated?: number;
  storiesMatched?: number;
} {
  const grabStr = (re: RegExp): string | undefined => {
    const m = re.exec(stdout);
    return m ? m[1].trim() : undefined;
  };
  const grabNum = (re: RegExp): number | undefined => {
    const v = grabStr(re);
    if (!v) return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    dossierPath: grabStr(/DOSSIER_PATH:\s*(\S+)/),
    interviewersResearched: grabNum(/INTERVIEWERS_RESEARCHED:\s*(\d+)/),
    questionsGenerated: grabNum(/QUESTIONS_GENERATED:\s*(\d+)/),
    storiesMatched: grabNum(/STORIES_MATCHED:\s*(\d+)/),
  };
}

export const POST = wrap(
  'dossier',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as Partial<DossierInput>;
    if (!body.stage) badRequest('stage required');
    const interviewers = Array.isArray(body.interviewers) ? body.interviewers : [];

    logEvent('dossier', 'Generating pre-call dossier · ' + body.stage, {
      level: 'info',
      category: 'application',
      message: (job.company || '?') + ' · ' + interviewers.length + ' interviewers',
    });

    try {
      const { stdout } = await spawnDossier({
        company: job.company ?? '',
        role: job.role ?? '',
        stage: body.stage,
        interviewers,
        profileId,
      });
      const meta = parseDossierStdout(stdout);
      logEvent('dossier', 'Dossier ready', {
        level: 'success',
        category: 'application',
        message:
          (meta.dossierPath ?? '') +
          (meta.interviewersResearched
            ? ' · ' + meta.interviewersResearched + ' interviewers'
            : ''),
      });
      return { ok: true, ...meta };
    } catch (err) {
      reportServerError('dossier', 'Dossier generation failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
