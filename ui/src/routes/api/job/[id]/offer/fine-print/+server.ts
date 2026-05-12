/**
 * POST /api/job/[id]/offer/fine-print
 *
 * Run the offer-fine-print extractor mode against pasted offer-letter
 * text. Body:
 *   {
 *     offerText: string,           // pasted directly OR from disk if empty
 *     userQuestions?: string[]
 *   }
 *
 * Output: `output/{company-slug}-fine-print-review.md` with high/medium
 * priority concerns + missing-in-writing items + a summary verdict.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';

const TIMEOUT_MS = 180_000;

function spawnFinePrint(args: {
  profileId: string;
  jobId: string;
  company: string;
  offerText: string;
  userQuestions?: string[];
}): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = {
      profileId: args.profileId,
      jobId: args.jobId,
      company: args.company,
      offerText: args.offerText,
      userQuestions: args.userQuestions ?? [],
    };
    const prompt =
      '/' +
      CLI_NAMESPACE +
      ' offer-fine-print ' +
      JSON.stringify({
        profileId: args.profileId,
        jobId: args.jobId,
        company: args.company,
        offerTextLength: args.offerText.length,
        userQuestions: args.userQuestions ?? [],
      });
    try {
      swapProfileSymlinks(args.profileId);
    } catch {}
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env, FINE_PRINT_INPUT: JSON.stringify(payload) },
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
      reject(new Error('offer-fine-print timeout after ' + TIMEOUT_MS + 'ms'));
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

function parseFinePrintPath(stdout: string): string | undefined {
  const m = /FINE_PRINT_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap(
  'fine-print',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as {
      offerText?: string;
      userQuestions?: string[];
    };
    // If no inline text supplied, try the on-disk path the user uploaded to.
    let offerText = (body.offerText ?? '').trim();
    if (!offerText) {
      const onDisk = path.join(
        profilePath(profileId, 'profile-dir'),
        'offers',
        job.id + '-letter.txt',
      );
      if (fs.existsSync(onDisk)) {
        try {
          offerText = fs.readFileSync(onDisk, 'utf8');
        } catch {}
      }
    }
    if (!offerText)
      badRequest('offerText is required (or place text at offers/{jobId}-letter.txt)');
    try {
      const { stdout } = await spawnFinePrint({
        profileId,
        jobId: job.id,
        company: job.company ?? '',
        offerText: offerText!,
        userQuestions: body.userQuestions,
      });
      const finePrintPath = parseFinePrintPath(stdout);
      logEvent('fine-print', 'Fine-print review complete', {
        level: 'success',
        category: 'application',
        message: finePrintPath ?? '(no path emitted)',
      });
      return { ok: true, finePrintPath };
    } catch (err) {
      reportServerError('fine-print', 'Fine-print extraction failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
