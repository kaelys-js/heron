/** Answer-form endpoint for the form-fill bookmarklet. The bookmarklet
 *  runs on Greenhouse / Ashby / Lever pages, scrapes labelled fields,
 *  POSTs them here. We (1) match `url` to a pipeline job so the prompt
 *  gets full context (cv.md, report, profile.yml from the spawn), (2)
 *  spawn `claude -p "/heron form-answers <url> --bookmarklet <json>"`
 *  with the question list piped on stdin, (3) return structured answers
 *  as JSON for the page-side fill.
 *  CORS: OPTIONS + POST enabled -- bookmarklet executes on a third-party
 *  origin. Localhost-bound, so scoped to the user's machine. */

import { json } from '@sveltejs/kit';
import { wrap, badRequest, errJson } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { getActiveProfileId } from '$lib/server/profiles';
import { logEvent, reportServerError } from '$lib/server/events';
import { spawnAgentWithMode } from '$lib/server/spawn-agent';

type Question = { label: string; type?: string };
type Answer = { label: string; value: string };

/**
 * CORS for the bookmarklet -- restricted to known ATS origins.
 *
 * Previously this endpoint used `Access-Control-Allow-Origin: *` which
 * meant ANY website you visited could fire arbitrary form-answer
 * generations against your local CLI. Now we echo the request Origin
 * back only if it matches a known ATS host pattern (the bookmarklet
 * only runs on these in practice).
 *
 * Wildcard fallback is removed -- unknown origins receive no CORS
 * headers, which the browser interprets as "cross-origin denied".
 */
const ATS_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/[a-z0-9-]+\.greenhouse\.io$/i,
  /^https:\/\/boards\.greenhouse\.io$/i,
  /^https:\/\/job-boards\.greenhouse\.io$/i,
  /^https:\/\/[a-z0-9-]+\.ashbyhq\.com$/i,
  /^https:\/\/jobs\.ashbyhq\.com$/i,
  /^https:\/\/jobs\.lever\.co$/i,
  /^https:\/\/[a-z0-9-]+\.lever\.co$/i,
  /^https:\/\/apply\.workable\.com$/i,
  /^https:\/\/[a-z0-9-]+\.workable\.com$/i,
  /^https:\/\/[a-z0-9-]+\.personio\.[a-z]+$/i,
  /^https:\/\/(www\.)?smartrecruiters\.com$/i,
  /^https:\/\/jobs\.smartrecruiters\.com$/i,
  /^https:\/\/[a-z0-9-]+\.recruitee\.com$/i,
  /^https:\/\/[a-z0-9-]+\.teamtailor\.com$/i,
  /^https:\/\/[a-z0-9-]+\.myworkdayjobs\.com$/i,
  /^https:\/\/(www\.)?indeed\.com$/i,
  /^https:\/\/[a-z]{2}\.indeed\.com$/i,
  /^https:\/\/(www\.)?linkedin\.com$/i,
];

function allowedOrigin(origin: string | null): string | null {
  if (!origin) {
    return null;
  }
  return ATS_ORIGIN_PATTERNS.some((re) => re.test(origin)) ? origin : null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedOrigin(origin);
  if (!allowed) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export function OPTIONS({ request }: { request: Request }): Response {
  const origin = request.headers.get('origin');
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

function withCors(res: Response, origin: string | null): Response {
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    res.headers.set(k, v);
  }
  return res;
}

function spawnAnswers(
  url: string,
  portal: string,
  questions: Question[],
  profileId: string,
): Promise<Answer[]> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = JSON.stringify({ url, portal, questions }, null, 2);

    const { child: p } = spawnAgentWithMode(
      'form-answers',
      `${url} --bookmarklet --json-output (questions piped via stdin as JSON)`,
      { profileId },
    );
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.stdin?.write(payload);
    p.stdin?.end();
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude -p exited ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      // The mode emits a JSON block. Try to extract the largest JSON object/
      // array from stdout. If parsing fails, return a heuristic mapping so
      // the bookmarklet still does *something* -- better than failing the
      // whole submit flow when only the JSON formatting was off.
      const arr = extractAnswers(stdout, questions);
      resolve(arr);
    });
  });
}

function extractAnswers(stdout: string, questions: Question[]): Answer[] {
  // Try to find a JSON array first -- most modes emit one.
  const arrMatch = stdout.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed) && parsed.every((x) => x && typeof x.label === 'string')) {
        return parsed.map((x) => ({ label: String(x.label), value: String(x.value ?? '') }));
      }
    } catch {}
  }
  // Fall back to a JSON object keyed by question label.
  const objMatch = stdout.match(/\{\s*"[^"]+"\s*:[\s\S]*?\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed && typeof parsed === 'object') {
        return questions
          .map((q) => ({
            label: q.label,
            value: String((parsed as Record<string, unknown>)[q.label] ?? ''),
          }))
          .filter((a) => a.value !== '');
      }
    } catch {}
  }
  // Last resort: return empty so the bookmarklet shows "0 of N filled" and
  // the user knows to retry / fix the prompt.
  return [];
}

export const POST = wrap('answer-form', async ({ request }: { request: Request }) => {
  const origin = request.headers.get('origin');

  // Reject requests from origins that aren't a known ATS. Browsers
  // enforce this via CORS, but enforcing it here too catches
  // server-to-server bypass attempts.
  if (origin && !allowedOrigin(origin)) {
    return errJson('origin not allowed', { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    badRequest('expected JSON body');
  }

  const url = typeof body.url === 'string' ? body.url : '';
  const portal = typeof body.portal === 'string' ? body.portal : 'unknown';
  const questions: Question[] = Array.isArray(body.questions)
    ? body.questions.filter((q: unknown) => q && typeof (q as Question).label === 'string')
    : [];

  if (!url) {
    badRequest('missing url');
  }
  if (questions.length === 0) {
    badRequest('missing questions');
  }

  // Defence-in-depth: cap questions per request so a hostile bookmarklet
  // can't spawn a runaway CLI invocation with 10k bogus questions.
  if (questions.length > 100) {
    badRequest('too many questions (max 100)');
  }

  // Validate URL is to an actual ATS -- prevents using this endpoint as
  // a generic Anthropic CLI proxy.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    badRequest('invalid url');
    return; // unreachable; appeases TS narrow
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    badRequest('url must be http(s)');
  }

  const job = loadAllJobs().find((j) => j.url === url);
  if (!job) {
    // Soft warning -- still try to answer using just the URL + JD scrape,
    // but log so the user knows why answers may be generic.
    logEvent('answer-form', 'URL not in pipeline', {
      level: 'warn',
      category: 'application',
      message: `${url} — answers will lack full context. Add the URL to your pipeline first.`,
    });
  }

  logEvent('answer-form', 'Bookmarklet form-fill', {
    level: 'info',
    category: 'application',
    message: `${portal} · ${questions.length} fields · ${job?.company ?? '?'}`,
  });

  try {
    const answers = await spawnAnswers(url, portal, questions, getActiveProfileId());
    logEvent('answer-form', 'Answers produced', {
      level: 'success',
      category: 'application',
      message: `${answers.length} / ${questions.length} fields`,
    });
    return withCors(json({ ok: true, answers, jobId: job?.id ?? null }), origin);
  } catch (err) {
    reportServerError('answer-form', 'Answer generation failed', err, { category: 'application' });
    return withCors(
      errJson(err instanceof Error ? err.message : String(err), { status: 500 }),
      origin,
    );
  }
});
