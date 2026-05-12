/**
 * /api/job/[id]/tech-prep — per-job technical-interview prep generation.
 *
 *   GET  → returns cached body if it exists
 *   POST → spawns `claude -p "/career-ops tech-prep <url>"` and persists
 *          to interview-prep/{company-slug}-{role-slug}-tech-prep.md
 *
 * The tech-prep mode reads the job's deep-eval report (for Block C
 * technical-fit) + cv.md + story-bank.md, hits the web for company-
 * specific interview reports (Glassdoor/Blind), and produces a focused
 * prep plan with budgeted hours, specific LeetCode problems, and the
 * 3-4 architectural debates the company cares about.
 *
 * Output stdout protocol (parsed for the toast + activity feed):
 *   TECH_PREP_PATH: <relative-path>
 *   TECH_PREP_ROUNDS: <int>
 *   TECH_PREP_HOURS_ESTIMATED: <int>
 *   TECH_PREP_SOURCES_CITED: <int>
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';

function slugify(s: string): string {
  return (
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'job'
  );
}

function persistedPath(profileId: string, company: string, role: string): string {
  return path.join(
    profilePath(profileId, 'interview-prep-dir'),
    slugify(company) + '-' + slugify(role) + '-tech-prep.md',
  );
}

function readCached(
  profileId: string,
  company: string,
  role: string,
): { path: string; body: string } | null {
  const p = persistedPath(profileId, company, role);
  try {
    if (fs.existsSync(p)) {
      return { path: path.relative(ROOT, p), body: fs.readFileSync(p, 'utf8') };
    }
  } catch {}
  return null;
}

type TechPrepMeta = {
  rounds?: number;
  hoursEstimated?: number;
  sourcesCited?: number;
};

function parseStdoutMeta(stdout: string): TechPrepMeta {
  const meta: TechPrepMeta = {};
  const grab = (re: RegExp): number | undefined => {
    const m = re.exec(stdout);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : undefined;
  };
  meta.rounds = grab(/TECH_PREP_ROUNDS:\s*(\d+)/);
  meta.hoursEstimated = grab(/TECH_PREP_HOURS_ESTIMATED:\s*(\d+)/);
  meta.sourcesCited = grab(/TECH_PREP_SOURCES_CITED:\s*(\d+)/);
  return meta;
}

function spawnTechPrep(
  url: string,
  profileId: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const prompt = '/' + CLI_NAMESPACE + ' tech-prep ' + url;
    try {
      swapProfileSymlinks(profileId);
    } catch (e) {
      logEvent('tech-prep', 'Symlink swap failed', {
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

export const GET = wrap(
  'tech-prep',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    return { cached: readCached(profileId, job.company ?? '', job.role ?? '') };
  },
);

export const POST = wrap(
  'tech-prep',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    if (!job.url) badRequest('Job has no URL');

    // De-dup: if a tech-prep file already exists for this company+role and
    // the caller didn't explicitly request regeneration, return the cached
    // body. Used by the markStatus auto-fire path so a job that transitions
    // PhoneScreen → Technical → Onsite doesn't regenerate three times.
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const force = body && typeof body === 'object' && (body as { force?: boolean }).force === true;
    if (!force) {
      const cached = readCached(profileId, job.company ?? '', job.role ?? '');
      if (cached) {
        logEvent('tech-prep', 'Tech-prep cached — returning existing file', {
          level: 'info',
          category: 'application',
          message: cached.path,
        });
        return { ok: true, path: cached.path, body: cached.body, cached: true };
      }
    }

    logEvent('tech-prep', 'Generating tech-prep plan', {
      level: 'info',
      category: 'application',
      message: (job.company || '?') + ' · ' + (job.role || '?'),
    });

    try {
      const { stdout } = await spawnTechPrep(job.url, profileId);
      const meta = parseStdoutMeta(stdout);
      // Re-read the file (the mode writes it directly).
      const cached = readCached(profileId, job.company ?? '', job.role ?? '');
      if (!cached) {
        // The mode might have written to a path we don't expect; fall back
        // to persisting stdout so the user gets *something*.
        const fallback = persistedPath(profileId, job.company ?? '', job.role ?? '');
        fs.mkdirSync(path.dirname(fallback), { recursive: true });
        fs.writeFileSync(fallback, stdout);
      }
      const result = readCached(profileId, job.company ?? '', job.role ?? '');
      logEvent('tech-prep', 'Tech-prep ready', {
        level: 'success',
        category: 'application',
        message:
          (result?.path ?? 'unknown path') +
          (meta.rounds ? ' · ' + meta.rounds + ' rounds' : '') +
          (meta.hoursEstimated ? ' · ' + meta.hoursEstimated + 'h budget' : ''),
      });
      return {
        ok: true,
        path: result?.path,
        body: result?.body,
        meta,
      };
    } catch (err) {
      reportServerError('tech-prep', 'Tech-prep generation failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
