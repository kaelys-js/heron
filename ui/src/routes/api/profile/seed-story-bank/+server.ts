/**
 * /api/profile/seed-story-bank — extract STAR+R stories from cv.md.
 *
 * POST → spawns the seed-story-bank Claude mode (`claude -p` + the prompt
 * file at modes/seed-story-bank.md). The mode reads cv.md + _profile.md +
 * the EXISTING story-bank.md, appends new stories, and prints a one-line
 * summary on stdout that we parse for the UI toast.
 *
 * Why an explicit "seed" action (vs. running oferta and waiting for Block F
 * to do it): users with no applications yet have an empty story-bank.md.
 * That blocks every future interview-prep run. One-shot seeding from the
 * CV fixes that bootstrap problem.
 */

import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';
import fs from 'node:fs';
import path from 'node:path';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  if (q && getProfile(q)) return q;
  return getActiveProfileId();
}

function spawnSeed(profileId: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const prompt = '/' + CLI_NAMESPACE + ' seed-story-bank';
    try {
      swapProfileSymlinks(profileId);
    } catch (e) {
      logEvent('seed-story-bank', 'Symlink swap failed', {
        level: 'warn',
        category: 'application',
        message: e instanceof Error ? e.message : String(e),
      });
    }
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
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      else resolve({ stdout, stderr });
    });
  });
}

export const POST = wrap('seed-story-bank', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  logEvent('seed-story-bank', 'Seeding story bank from cv.md', {
    level: 'info',
    category: 'application',
  });

  // story-bank.md is SHARED (not per-profile) per AGENTS.md, but the spawn
  // reads from per-profile cv.md / _profile.md via the symlink swap.
  const bankPath = path.join(ROOT, 'interview-prep', 'story-bank.md');
  const beforeSize = fs.existsSync(bankPath) ? fs.statSync(bankPath).size : 0;

  try {
    const { stdout } = await spawnSeed(profileId);
    // Parse the "SEEDED N stories · M themes covered · K coverage gaps" line.
    const m = /SEEDED (\d+) stories(?: · (\d+) themes)?(?: · (\d+) coverage gaps)?/i.exec(stdout);
    const seeded = m ? parseInt(m[1], 10) : null;
    const afterSize = fs.existsSync(bankPath) ? fs.statSync(bankPath).size : 0;
    const grew = afterSize > beforeSize;

    logEvent('seed-story-bank', 'Story bank seeded', {
      level: 'success',
      category: 'application',
      message:
        (seeded != null ? seeded + ' stories' : 'seeded') +
        ' · file ' +
        (afterSize - beforeSize) +
        ' bytes larger',
    });

    return {
      ok: true,
      seeded,
      profileId,
      grewBy: afterSize - beforeSize,
      bankPath: path.relative(ROOT, bankPath),
      summary: m ? m[0] : null,
      grew,
    };
  } catch (err) {
    reportServerError('seed-story-bank', 'Story bank seeding failed', err, {
      category: 'application',
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

export const GET = wrap('seed-story-bank', async () => {
  // GET → stats about the current story bank so the UI can show
  // "23 stories · last updated 2 days ago" or "empty — seed now".
  const bankPath = path.join(ROOT, 'interview-prep', 'story-bank.md');
  if (!fs.existsSync(bankPath)) {
    return { exists: false, storyCount: 0, lastUpdatedAt: null };
  }
  const stat = fs.statSync(bankPath);
  const txt = fs.readFileSync(bankPath, 'utf8');
  // Count `### ` headings (skipping the bullet-list intro). Each story
  // starts with `### [Theme] Title`. Must skip headings inside HTML
  // comments — the shipped story-bank.md includes a "Format:" example
  // inside <!-- --> that would otherwise be counted as 1 fake story.
  let storyCount = 0;
  let inComment = false;
  for (const rawLine of txt.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('<!--') && !line.includes('-->')) {
      inComment = true;
      continue;
    }
    if (inComment) {
      if (line.endsWith('-->')) inComment = false;
      continue;
    }
    if (line.startsWith('<!--') && line.endsWith('-->')) continue;
    if (line.startsWith('### ')) storyCount++;
  }
  return {
    exists: true,
    storyCount,
    lastUpdatedAt: stat.mtimeMs,
    bytes: stat.size,
  };
});
