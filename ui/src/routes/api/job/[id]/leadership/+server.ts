/**
 * GET /api/job/[id]/leadership
 *
 * Pull the leadership-lookup deep-research blob for this job's company.
 * Cached at `{profile-dir}/leadership/{company-slug}.json` for 30 days;
 * `?force=1` bypasses the cache. Same legal posture as comp-benchmark
 * and team-rep — hits public pages once, doesn't scrape.
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
const CACHE_DAYS = 30;

export type LeadershipRecord = {
  founders?: {
    name: string;
    stillActive: boolean;
    currentRole?: string;
    tenureYears?: number;
    priorCompanies?: string[];
    publicProfile?: string;
  }[];
  cSuite?: {
    name: string;
    title: string;
    startedAt?: string;
    tenureYears?: number;
    priorCompanies?: string[];
    publicProfile?: string;
  }[];
  avgCSuiteTenureYears?: number;
  departures12Months?: {
    name: string;
    formerTitle: string;
    departedAt: string;
    notes?: string;
  }[];
  redFlags?: { kind: string; detail: string }[];
  greenFlags?: { kind: string; detail: string }[];
  sources: string[];
  refreshedAt: number;
};

function cachePath(profileId: string, slug: string): string {
  return path.join(profilePath(profileId, 'profile-dir'), 'leadership', slug + '.json');
}

function companySlug(company: string): string {
  return (company || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function spawnLeadership(args: {
  profileId: string;
  jobId: string;
  company: string;
  focusRole?: string;
}): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = {
      profileId: args.profileId,
      jobId: args.jobId,
      company: args.company,
      focusRole: args.focusRole,
    };
    const prompt = '/' + CLI_NAMESPACE + ' leadership-lookup ' + JSON.stringify(payload);
    try {
      swapProfileSymlinks(args.profileId);
    } catch {}
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env, LEADERSHIP_INPUT: JSON.stringify(payload) },
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
      reject(new Error('leadership-lookup timeout after ' + TIMEOUT_MS + 'ms'));
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

export const GET = wrap(
  'leadership',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const force = url.searchParams.get('force') === '1';
    const focusRole = url.searchParams.get('focusRole') ?? undefined;
    const slug = companySlug(job.company);
    const p = cachePath(profileId, slug);
    if (!force && fs.existsSync(p)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as LeadershipRecord;
        const ageDays = (Date.now() - parsed.refreshedAt) / (24 * 60 * 60 * 1000);
        if (ageDays < CACHE_DAYS) {
          return { ok: true, leadership: parsed, cacheAgeDays: Math.round(ageDays) };
        }
      } catch {}
    }
    try {
      const { stdout } = await spawnLeadership({
        profileId,
        jobId: job.id,
        company: job.company ?? '',
        focusRole,
      });
      const m = stdout.match(/\{[\s\S]*?"sources"[\s\S]*?\}/);
      if (!m) return { ok: false, error: 'leadership-lookup did not emit JSON' };
      const parsed: LeadershipRecord = JSON.parse(m[0]);
      parsed.refreshedAt = Date.now();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(parsed, null, 2));
      logEvent('leadership', 'Leadership snapshot refreshed · ' + job.company, {
        level: 'success',
        category: 'application',
        message:
          (parsed.redFlags?.length ?? 0) +
          ' red flags · ' +
          (parsed.greenFlags?.length ?? 0) +
          ' green flags',
      });
      return { ok: true, leadership: parsed, cacheAgeDays: 0 };
    } catch (err) {
      reportServerError('leadership', 'Lookup failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
