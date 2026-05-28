/** GET /api/job/[id]/team-rep -- team-reputation signals from public sources:
 *  Glassdoor (rating, Recommend %, CEO approval, interview difficulty), Blind
 *  (sentiment, layoff/cash-burn discussion snippets), Layoffs.fyi (events),
 *  LinkedIn headcount trend (via deep-research, no direct scraping). Same
 *  ToS posture as comp-benchmark.ts: agent CLI deep-researches, same as a
 *  human visiting once. Cache: returns the blob at data/users/.../team-rep/
 *  {slug}.json if <21d old; else spawns deep-research. Force refresh:
 *  body { force: true }. */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';

const TIMEOUT_MS = 180_000;
const CACHE_DAYS = 21;

export type TeamRep = {
  glassdoorRating?: number;
  glassdoorRecommend?: number;
  glassdoorCeoApproval?: number;
  glassdoorInterviewDifficulty?: number;
  glassdoorPros?: string[];
  glassdoorCons?: string[];
  blindSentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  blindSnippets?: string[];
  recentLayoffs?: {
    date: string;
    headcount?: number;
    note?: string;
  }[];
  headcountTrend?: 'growing' | 'flat' | 'shrinking';
  sources: string[];
  refreshedAt: number;
};

function cachePath(profileId: string, slug: string): string {
  const base = profilePath(profileId, 'profile-dir');
  return path.join(base, 'team-rep', `${slug}.json`);
}

function companySlug(company: string): string {
  return (company || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function spawnTeamRep(args: {
  profileId: string;
  company: string;
  jobId: string;
}): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = { company: args.company, jobId: args.jobId, profileId: args.profileId };

    const { child: p } = spawnAgentWithMode('team-rep', JSON.stringify(payload), {
      profileId: args.profileId,
      env: { TEAM_REP_INPUT: JSON.stringify(payload) },
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
      reject(new Error(`team-rep timeout after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      } else {
        resolveP({ stdout });
      }
    });
  });
}

export const GET = wrap(
  'team-rep',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) {
      badRequest('Job not found: ' + params.id);
    }
    const { job, profileId } = resolved!;
    const force = url.searchParams.get('force') === '1';
    const slug = companySlug(job.company);
    const p = cachePath(profileId, slug);
    if (!force && fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as TeamRep;
        const ageDays = (Date.now() - parsed.refreshedAt) / (24 * 60 * 60 * 1000);
        if (ageDays < CACHE_DAYS) {
          return { ok: true, teamRep: parsed, cacheAgeDays: ageDays };
        }
      } catch {}
    }
    try {
      const { stdout } = await spawnTeamRep({
        profileId,
        company: job.company ?? '',
        jobId: job.id,
      });
      const m = stdout.match(/\{[\s\S]*?"sources"[\s\S]*?\}/);
      if (!m) {
        return { ok: false, error: 'Team-rep mode did not emit JSON' };
      }
      const parsed: TeamRep = JSON.parse(m[0]);
      parsed.refreshedAt = Date.now();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(parsed, null, 2));
      logEvent('team-rep', `Team-rep refreshed · ${job.company}`, {
        level: 'success',
        category: 'application',
        message: `sources: ${(parsed.sources || []).join(',')}`,
      });
      return { ok: true, teamRep: parsed, cacheAgeDays: 0 };
    } catch (err) {
      reportServerError('team-rep', 'Team-rep fetch failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
