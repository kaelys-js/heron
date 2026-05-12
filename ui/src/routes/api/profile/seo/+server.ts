/**
 * POST /api/profile/seo
 *
 * Run the LinkedIn / portfolio SEO checker for the active profile.
 *
 * Body (all optional):
 *   { headline?: string, about?: string }
 *
 * When body is empty, the script reads `data/users/{userId}/profiles/
 * {slug}/linkedin-export.txt` if it exists. The user creates that file
 * by exporting their LinkedIn About + headline (Settings → Data Export).
 *
 * Returns the composite 0-100 score + per-check evidence + the gap list
 * (target keywords missing from headline/about for the user's archetypes).
 */

import { spawn } from 'node:child_process';
import { wrap } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import path from 'node:path';
import { logEvent, reportServerError } from '$lib/server/events';

const TIMEOUT_MS = 10_000;

type Body = { headline?: string; about?: string };

type SeoResult = {
  composite: number;
  checks: { name: string; score: number; evidence: string }[];
  headlineLength: number;
  archetypeKeysApplied: string[];
  topKeywords: string[];
  matchedInHeadline: string[];
  matchedInAbout: string[];
};

export const POST = wrap('profile-seo', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as Body;
  return new Promise<{ ok: boolean; seo?: SeoResult; error?: string }>((resolveP) => {
    const args = [path.join(ROOT, 'profile-seo.mjs'), '--json'];
    if (body.headline) args.push('--headline', body.headline);
    if (body.about) args.push('--about', body.about);
    const p = spawn('node', args, { cwd: ROOT, env: { ...process.env } });
    let stdoutBuf = '';
    let stderrBuf = '';
    p.stdout?.on('data', (c: Buffer) => {
      stdoutBuf += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderrBuf += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {}
      resolveP({ ok: false, error: 'profile-seo timeout' });
    }, TIMEOUT_MS);
    p.on('error', (err) => {
      clearTimeout(timer);
      reportServerError('profile-seo', 'spawn failed', err);
      resolveP({ ok: false, error: err.message });
    });
    p.on('close', () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdoutBuf) as SeoResult;
        logEvent('profile-seo', 'SEO score ' + parsed.composite + '/100', {
          level: parsed.composite >= 70 ? 'success' : parsed.composite >= 50 ? 'info' : 'warn',
          category: 'user',
          message: parsed.matchedInHeadline.length + ' keyword hits in headline',
        });
        resolveP({ ok: true, seo: parsed });
      } catch {
        resolveP({ ok: false, error: stderrBuf.slice(-200) || 'non-JSON output' });
      }
    });
  });
});
