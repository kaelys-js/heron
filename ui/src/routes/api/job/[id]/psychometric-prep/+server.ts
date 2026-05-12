/**
 * POST /api/job/[id]/psychometric-prep
 *
 * Detects the psychometric test (Pymetrics / Plum / Harver / etc.) from
 * the invite text the user pastes, then spawns the `psychometric-prep`
 * mode to draft a technique brief.
 *
 * Body:
 *   {
 *     testIdentifier?: 'pymetrics' | 'plum' | 'harver' | 'cangrade' |
 *                      'wonderlic' | 'berke' | 'predictive-index' |
 *                      'hogan' | 'caliper' | 'criteria-cognitive-aptitude' |
 *                      'revelian' | 'koru7' | 'arctic-shores' | 'unknown',
 *     inviteText: string,
 *     dueDate?: string
 *   }
 *
 * When `testIdentifier === 'unknown'` (or omitted), we detect from
 * `inviteText` patterns before passing to the mode.
 */

import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';

const TIMEOUT_MS = 120_000;

const DETECTION_PATTERNS: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 'pymetrics', patterns: [/pymetrics\.ai/i, /\bpymetrics\b/i, /12 gamified/i] },
  { id: 'plum', patterns: [/plum\.io/i, /\bPlum\b/i, /Discovery Survey/i] },
  { id: 'harver', patterns: [/harver\.com/i, /\bHarver\b/i] },
  { id: 'cangrade', patterns: [/cangrade\.com/i, /\bCangrade\b/i] },
  {
    id: 'wonderlic',
    patterns: [/wonderlic/i, /WPT\b/i, /Wonderlic Personnel Test/i],
  },
  { id: 'berke', patterns: [/berkeassessment\.com/i, /\bBerke\b/i] },
  {
    id: 'predictive-index',
    patterns: [/predictiveindex\.com/i, /Predictive Index/i, /\bPI Behavioral\b/i],
  },
  {
    id: 'hogan',
    patterns: [/hoganassessments\.com/i, /Hogan Personality Inventory/i, /\bHogan\b/i],
  },
  { id: 'caliper', patterns: [/calipercorp\.com/i, /Caliper Profile/i] },
  {
    id: 'criteria-cognitive-aptitude',
    patterns: [/criteriacorp\.com/i, /CCAT\b/i, /Criteria Cognitive Aptitude/i],
  },
  { id: 'revelian', patterns: [/revelian\.com/i, /Revelian Cognitive/i] },
  { id: 'koru7', patterns: [/koru\.co/i, /Koru7 Fingerprint/i] },
  { id: 'arctic-shores', patterns: [/arcticshores\.com/i, /Arctic Shores/i] },
];

function detectTestId(inviteText: string): string {
  for (const { id, patterns } of DETECTION_PATTERNS) {
    for (const p of patterns) {
      if (p.test(inviteText)) return id;
    }
  }
  return 'unknown';
}

function spawnPrep(args: {
  profileId: string;
  jobId: string;
  company: string;
  role: string;
  testIdentifier: string;
  inviteText: string;
  dueDate?: string;
}): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = { ...args };
    const prompt =
      '/' +
      CLI_NAMESPACE +
      ' psychometric-prep ' +
      JSON.stringify({
        profileId: args.profileId,
        jobId: args.jobId,
        company: args.company,
        testIdentifier: args.testIdentifier,
      });
    try {
      swapProfileSymlinks(args.profileId);
    } catch {}
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env, PSYCHOMETRIC_PREP_INPUT: JSON.stringify(payload) },
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
      reject(new Error('psychometric-prep timeout after ' + TIMEOUT_MS + 'ms'));
    }, TIMEOUT_MS);
    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      else resolveP({ stdout });
    });
  });
}

function parsePsychometricPath(stdout: string): string | undefined {
  const m = /PSYCHOMETRIC_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap(
  'psychometric-prep',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as {
      testIdentifier?: string;
      inviteText?: string;
      dueDate?: string;
    };
    if (!body.inviteText) badRequest('inviteText is required');
    const testIdentifier =
      body.testIdentifier && body.testIdentifier !== 'unknown'
        ? body.testIdentifier
        : detectTestId(body.inviteText!);
    try {
      const { stdout } = await spawnPrep({
        profileId,
        jobId: job.id,
        company: job.company ?? '',
        role: job.role ?? '',
        testIdentifier,
        inviteText: body.inviteText!,
        dueDate: body.dueDate,
      });
      const psychometricPath = parsePsychometricPath(stdout);
      logEvent('psychometric-prep', testIdentifier + ' prep drafted', {
        level: 'success',
        category: 'application',
        message: psychometricPath ?? '(no path emitted)',
      });
      return { ok: true, testIdentifier, psychometricPath };
    } catch (err) {
      reportServerError('psychometric-prep', 'Prep failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
