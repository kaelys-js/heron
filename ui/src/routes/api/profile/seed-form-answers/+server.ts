/**
 * /api/profile/seed-form-answers — pre-populate the form-answers cache
 * from cv.md + profile.yml so the FIRST autonomous-apply run doesn't
 * dead-end on `unknown-field:notice period` and similar.
 *
 * POST → spawns the seed-form-answers Claude mode, reads back the count
 *        of rows written, returns it for the UI toast.
 *
 * GET  → returns the current cache stats (count + last-update) so the UI
 *        can decide whether to prompt for seeding.
 *
 * Auto-fired during onboarding completion + manually from the
 * FormAnswersCard "Seed from CV + profile" button.
 */

import { spawn } from 'node:child_process';
import { wrap } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { listAnswers, cacheStats } from '$lib/server/form-answers-cache';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  if (q && getProfile(q)) return q;
  return getActiveProfileId();
}

function spawnSeed(profileId: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const prompt = '/' + CLI_NAMESPACE + ' seed-form-answers';
    try { swapProfileSymlinks(profileId); } catch (e) {
      logEvent('seed-form-answers', 'Symlink swap failed', {
        level: 'warn', category: 'application',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      else resolve({ stdout, stderr });
    });
  });
}

function parseSeedStdout(stdout: string): {
  rowsWritten?: number;
  rowsSkippedExisting?: number;
  rowsSkippedUnsure?: number;
  filePath?: string;
} {
  const meta: ReturnType<typeof parseSeedStdout> = {};
  const grab = (re: RegExp): number | undefined => {
    const m = re.exec(stdout);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : undefined;
  };
  const grabStr = (re: RegExp): string | undefined => {
    const m = re.exec(stdout);
    return m ? m[1].trim() : undefined;
  };
  meta.rowsWritten = grab(/SEED_ROWS_WRITTEN:\s*(\d+)/);
  meta.rowsSkippedExisting = grab(/SEED_ROWS_SKIPPED_EXISTING:\s*(\d+)/);
  meta.rowsSkippedUnsure = grab(/SEED_ROWS_SKIPPED_UNSURE:\s*(\d+)/);
  meta.filePath = grabStr(/SEED_FILE_PATH:\s*(\S+)/);
  return meta;
}

export const GET = wrap('seed-form-answers', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  return {
    profileId,
    stats: cacheStats(profileId),
    sampleAnswers: listAnswers(profileId).slice(0, 5),
  };
});

export const POST = wrap('seed-form-answers', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  const statsBefore = cacheStats(profileId);

  logEvent('seed-form-answers', 'Seeding form-answers cache', {
    level: 'info', category: 'application',
    message: profileId,
  });

  try {
    const { stdout } = await spawnSeed(profileId);
    const meta = parseSeedStdout(stdout);
    const statsAfter = cacheStats(profileId);
    const actualDelta = statsAfter.total - statsBefore.total;

    logEvent('seed-form-answers', 'Cache seeded', {
      level: 'success', category: 'application',
      message: `+${actualDelta} rows (claim: ${meta.rowsWritten ?? '?'}); total now ${statsAfter.total}`,
    });

    return {
      ok: true,
      profileId,
      ...meta,
      rowsActuallyAdded: actualDelta,
      statsBefore,
      statsAfter,
    };
  } catch (err) {
    reportServerError('seed-form-answers', 'Seed failed', err, { category: 'application' });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
