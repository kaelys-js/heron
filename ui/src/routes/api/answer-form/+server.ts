/**
 * Answer-form endpoint for the bookmarklet (Path B of Phase 4.6).
 *
 * The browser-side bookmarklet runs on Greenhouse / Ashby / Lever job pages,
 * scrapes labelled fields, and POSTs them here. We:
 *   1. Try to match `url` to an existing pipeline job (so we have full context
 *      for the prompt — cv.md, report file, profile.yml come from the spawn)
 *   2. Spawn `claude -p "/career-ops form-answers <url> --bookmarklet <json>"`
 *      and pipe the question list as JSON via stdin
 *   3. Return the structured answers as JSON the bookmarklet can fill into
 *      the page
 *
 * CORS: enabled for OPTIONS + POST since the bookmarklet executes on a
 * third-party domain (greenhouse.io, ashbyhq.com, etc.). Listening on
 * localhost:5174 makes this trivially scoped to the user's machine.
 */

import { spawn } from 'node:child_process';
import { json } from '@sveltejs/kit';
import { wrap, badRequest, errJson } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { ROOT } from '$lib/server/files';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';

type Question = { label: string; type?: string };
type Answer = { label: string; value: string };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

function spawnAnswers(url: string, portal: string, questions: Question[]): Promise<Answer[]> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = JSON.stringify({ url, portal, questions }, null, 2);
    const prompt =
      '/' +
      CLI_NAMESPACE +
      ' form-answers ' +
      url +
      ' --bookmarklet --json-output' +
      ' (questions piped via stdin as JSON)';
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env },
    });
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
        reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
        return;
      }
      // The mode emits a JSON block. Try to extract the largest JSON object/
      // array from stdout. If parsing fails, return a heuristic mapping so
      // the bookmarklet still does *something* — better than failing the
      // whole submit flow when only the JSON formatting was off.
      const arr = extractAnswers(stdout, questions);
      resolve(arr);
    });
  });
}

function extractAnswers(stdout: string, questions: Question[]): Answer[] {
  // Try to find a JSON array first — most modes emit one.
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
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') badRequest('expected JSON body');

  const url = typeof body.url === 'string' ? body.url : '';
  const portal = typeof body.portal === 'string' ? body.portal : 'unknown';
  const questions: Question[] = Array.isArray(body.questions)
    ? body.questions.filter((q: unknown) => q && typeof (q as Question).label === 'string')
    : [];

  if (!url) badRequest('missing url');
  if (questions.length === 0) badRequest('missing questions');

  const job = loadAllJobs().find((j) => j.url === url);
  if (!job) {
    // Soft warning — still try to answer using just the URL + JD scrape,
    // but log so the user knows why answers may be generic.
    logEvent('answer-form', 'URL not in pipeline', {
      level: 'warn',
      category: 'application',
      message: url + ' — answers will lack full context. Add the URL to your pipeline first.',
    });
  }

  logEvent('answer-form', 'Bookmarklet form-fill', {
    level: 'info',
    category: 'application',
    message: portal + ' · ' + questions.length + ' fields · ' + (job?.company ?? '?'),
  });

  try {
    const answers = await spawnAnswers(url, portal, questions);
    logEvent('answer-form', 'Answers produced', {
      level: 'success',
      category: 'application',
      message: answers.length + ' / ' + questions.length + ' fields',
    });
    return withCors(json({ ok: true, answers, jobId: job?.id ?? null }));
  } catch (err) {
    reportServerError('answer-form', 'Answer generation failed', err, { category: 'application' });
    return withCors(errJson(err instanceof Error ? err.message : String(err), { status: 500 }));
  }
});
