/**
 * GET  /api/job/[id]/referrals  → list pre-drafted referral asks for this job
 * POST /api/job/[id]/referrals  → spawn the referral-discovery mode
 *
 * The mode walks the user's LinkedIn 1st/2nd-degree network for people
 * currently at the target company, ranked by closeness + role-relevance,
 * and pre-drafts an outreach message per person ("Hi {name}, I saw you
 * work at {company} on {team}. I'm applying for {role} -- would you mind
 * passing along my CV?").
 *
 * Body:
 *   { maxResults?: number, locationFilter?: string }
 *
 * Output: `data/users/{userId}/profiles/{slug}/referrals/{jobId}.json`
 * with the ranked list.
 *
 * NOTE: this is a network-graph-only mode -- it does NOT send messages. The
 * user reviews + sends each ask manually (or copies into LinkedIn).
 */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
const TIMEOUT_MS = 240_000;

export type ReferralCandidate = {
  name: string;
  title?: string;
  team?: string;
  linkedinUrl?: string;
  /** Closeness score 0-100. Stronger ties rank higher. */
  closeness: number;
  /** Reason this person is a good ask (e.g. "ex-colleague at X", "you both worked at Y"). */
  rationale: string;
  /** Pre-drafted message the user can copy + send. */
  draft: string;
};

function referralsPath(profileId: string, jobId: string): string {
  const base = profilePath(profileId, 'profile-dir');
  return path.join(base, 'referrals', jobId + '.json');
}

function spawnReferralDiscovery(args: {
  profileId: string;
  jobId: string;
  company: string;
  role: string;
  maxResults: number;
  locationFilter?: string;
}): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = {
      profileId: args.profileId,
      jobId: args.jobId,
      company: args.company,
      role: args.role,
      maxResults: args.maxResults,
      locationFilter: args.locationFilter,
    };

    const { child: p } = spawnAgentWithMode('referral-discovery', JSON.stringify(payload), {
      profileId: args.profileId,
      env: { REFERRAL_INPUT: JSON.stringify(payload) },
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
      reject(new Error('referral-discovery timeout after ' + TIMEOUT_MS + 'ms'));
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
  'referrals',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const p = referralsPath(profileId, job.id);
    if (!fs.existsSync(p)) return { ok: true, candidates: [], generatedAt: null };
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as {
        candidates: ReferralCandidate[];
        generatedAt: number;
      };
      return { ok: true, candidates: parsed.candidates ?? [], generatedAt: parsed.generatedAt };
    } catch {
      return { ok: true, candidates: [], generatedAt: null };
    }
  },
);

export const POST = wrap(
  'referrals',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as {
      maxResults?: number;
      locationFilter?: string;
    };
    const maxResults = Math.max(1, Math.min(50, body.maxResults ?? 10));
    try {
      await spawnReferralDiscovery({
        profileId,
        jobId: job.id,
        company: job.company ?? '',
        role: job.role ?? '',
        maxResults,
        locationFilter: body.locationFilter,
      });
      const p = referralsPath(profileId, job.id);
      if (!fs.existsSync(p))
        return { ok: false, error: 'Discovery did not produce a referrals file' };
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as {
        candidates: ReferralCandidate[];
        generatedAt: number;
      };
      logEvent('referrals', 'Referral discovery complete', {
        level: 'success',
        category: 'application',
        message: (job.company || '?') + ' · ' + (parsed.candidates?.length ?? 0) + ' candidates',
      });
      return { ok: true, candidates: parsed.candidates ?? [], generatedAt: parsed.generatedAt };
    } catch (err) {
      reportServerError('referrals', 'Referral discovery failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
