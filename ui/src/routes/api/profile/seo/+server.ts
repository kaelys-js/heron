/** POST /api/profile/seo -- LinkedIn / portfolio SEO checker for the
 *  active profile. Body { headline?, about? } both optional; when empty,
 *  the script falls back to data/users/{uid}/profiles/{slug}/linkedin-export.txt
 *  (user exports it from Settings → Data Export). Returns composite 0-100 +
 *  per-check evidence + target-keyword gap list against archetypes. */

import { spawn } from 'node:child_process';
import { wrap } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import path from 'node:path';
import { logEvent, reportServerError } from '$lib/server/events';
import { userContextEnv } from '$lib/server/user-context';

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
    const args = [path.join(ROOT, 'scripts/quality/profile-seo.mjs'), '--json'];
    if (body.headline) {
      args.push('--headline', body.headline);
    }
    if (body.about) {
      args.push('--about', body.about);
    }
    const p = spawn('node', args, { cwd: ROOT, env: userContextEnv() });
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
        logEvent('profile-seo', `SEO score ${parsed.composite}/100`, {
          level: parsed.composite >= 70 ? 'success' : parsed.composite >= 50 ? 'info' : 'warn',
          category: 'user',
          message: `${parsed.matchedInHeadline.length} keyword hits in headline`,
        });
        resolveP({ ok: true, seo: parsed });
      } catch {
        resolveP({ ok: false, error: stderrBuf.slice(-200) || 'non-JSON output' });
      }
    });
  });
});
