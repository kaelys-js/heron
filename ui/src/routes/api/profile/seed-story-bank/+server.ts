/** /api/profile/seed-story-bank -- extract STAR+R stories from cv.md.
 *  POST → spawn seed-story-bank Claude mode (modes/seed-story-bank.md).
 *  Mode reads cv.md + _profile.md + existing story-bank.md, appends new
 *  stories, prints a one-line stdout summary parsed for the UI toast.
 *  Explicit seed (vs. waiting for Block F in evaluate) so first-time
 *  users with empty story-bank.md can still run interview-prep. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath, userSharedPath } from '$lib/server/profile-paths';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { spawnAgentWithMode } from '$lib/server/spawn-agent';
import { logEvent, reportServerError } from '$lib/server/events';
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
    // seed-story-bank reads reports/ + cv.md + _profile.md to draft
    // the story bank. No user input needed.
    const { child: p } = spawnAgentWithMode('seed-story-bank', '', { profileId });
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

  // story-bank.md is per-user shared-across-profiles. Resolve against
  // the active user; cv.md / _profile.md are per-profile and resolved
  // by the spawnAgentWithMode token substitution.
  const bankPath = userSharedPath('story-bank');
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
  // "23 stories · last updated 2 days ago" or "empty -- seed now".
  const bankPath = path.join(ROOT, 'interview-prep', 'story-bank.md');
  // CodeQL js/file-system-race: open once and use fstatSync/readFileSync
  // through the fd so stat and read agree on the same inode atomically.
  let fd: number;
  try {
    fd = fs.openSync(bankPath, 'r');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, storyCount: 0, lastUpdatedAt: null };
    }
    throw e;
  }
  let stat: fs.Stats;
  let txt: string;
  try {
    stat = fs.fstatSync(fd);
    txt = fs.readFileSync(fd, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
  // Count `### ` headings (skipping the bullet-list intro). Each story
  // starts with `### [Theme] Title`. Must skip headings inside HTML
  // comments -- the shipped story-bank.md includes a "Format:" example
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
