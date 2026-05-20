/** POST /api/job/[id]/psychometric-prep -- detect the psychometric test
 *  (Pymetrics / Plum / Harver / etc.) from the pasted invite text, then spawn
 *  the psychometric-prep mode to draft a technique brief. Body:
 *  { testIdentifier?: 'pymetrics'|'plum'|'harver'|'cangrade'|'wonderlic'|
 *  'berke'|'predictive-index'|'hogan'|'caliper'|'criteria-cognitive-aptitude'|
 *  'revelian'|'koru7'|'arctic-shores'|'unknown', inviteText: string,
 *  dueDate?: string }. When testIdentifier='unknown' (or omitted), detect
 *  from inviteText regex patterns before passing to the mode. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
const TIMEOUT_MS = 120_000;

// Test-vendor detection patterns. `substrings` are case-insensitive substring
// matches (CodeQL js/regex/missing-regexp-anchor: pattern 4 -- substring is
// intended). `regexes` are kept for word-bounded matches (\b...\b) that need
// precision against substrings like "harvester" matching "harver".
const DETECTION_PATTERNS: Array<{ id: string; substrings: string[]; regexes?: RegExp[] }> = [
  {
    id: 'pymetrics',
    substrings: ['pymetrics.ai', '12 gamified'],
    regexes: [/\bpymetrics\b/i],
  },
  {
    id: 'plum',
    substrings: ['plum.io', 'Discovery Survey'],
    regexes: [/\bPlum\b/i],
  },
  { id: 'harver', substrings: ['harver.com'], regexes: [/\bHarver\b/i] },
  { id: 'cangrade', substrings: ['cangrade.com'], regexes: [/\bCangrade\b/i] },
  {
    id: 'wonderlic',
    substrings: ['wonderlic', 'Wonderlic Personnel Test'],
    regexes: [/WPT\b/i],
  },
  { id: 'berke', substrings: ['berkeassessment.com'], regexes: [/\bBerke\b/i] },
  {
    id: 'predictive-index',
    substrings: ['predictiveindex.com', 'Predictive Index'],
    regexes: [/\bPI Behavioral\b/i],
  },
  {
    id: 'hogan',
    substrings: ['hoganassessments.com', 'Hogan Personality Inventory'],
    regexes: [/\bHogan\b/i],
  },
  { id: 'caliper', substrings: ['calipercorp.com', 'Caliper Profile'] },
  {
    id: 'criteria-cognitive-aptitude',
    substrings: ['criteriacorp.com', 'Criteria Cognitive Aptitude'],
    regexes: [/CCAT\b/i],
  },
  { id: 'revelian', substrings: ['revelian.com', 'Revelian Cognitive'] },
  { id: 'koru7', substrings: ['koru.co', 'Koru7 Fingerprint'] },
  { id: 'arctic-shores', substrings: ['arcticshores.com', 'Arctic Shores'] },
];

function detectTestId(inviteText: string): string {
  const lower = inviteText.toLowerCase();
  for (const { id, substrings, regexes } of DETECTION_PATTERNS) {
    if (substrings.some((s) => lower.includes(s.toLowerCase()))) return id;
    if (regexes?.some((r) => r.test(inviteText))) return id;
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

    const { child: p } = spawnAgentWithMode(
      'psychometric-prep',
      JSON.stringify({
        profileId: args.profileId,
        jobId: args.jobId,
        company: args.company,
        testIdentifier: args.testIdentifier,
      }),
      {
        profileId: args.profileId,
        env: { PSYCHOMETRIC_PREP_INPUT: JSON.stringify(payload) },
      },
    );
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
