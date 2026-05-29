/** POST /api/profile/cross-link-audit -- validate that the user's CV,
 *  profile.yml, and linked external profiles (GitHub, LinkedIn, portfolio)
 *  tell the same story. Recruiters Google candidates; CV "Senior Engineer"
 *  vs LinkedIn "Lead Engineer" raises a red flag. Checks: name, current
 *  role + title, most-recent employer, implied years-of-experience, CV
 *  projects vs pinned GitHub repos, CV skills vs LinkedIn skills. Spawns
 *  the cross-link-audit mode (does the fetching + comparison). Output:
 *  data/users/.../profiles/.../cross-link-audit.json. */

import fs from 'node:fs';
import path from 'node:path';
import { wrap } from '$lib/server/api-helpers';
import { profilePath } from '$lib/server/profile-paths';
import { getActiveProfileId } from '$lib/server/profiles';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';

const TIMEOUT_MS = 180_000;

export type CrossLinkFinding = {
  /** Severity: 'mismatch' (real inconsistency), 'gap' (missing on one side), 'ok'. */
  level: 'mismatch' | 'gap' | 'ok';
  field: 'name' | 'currentRole' | 'currentEmployer' | 'yearsExperience' | 'projects' | 'skills';
  cv?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  advice?: string;
};

function spawnAudit(args: { profileId: string }): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = { profileId: args.profileId };

    const { child: p } = spawnAgentWithMode('cross-link-audit', JSON.stringify(payload), {
      profileId: args.profileId,
      env: { CROSS_LINK_INPUT: JSON.stringify(payload) },
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
      reject(new Error(`cross-link-audit timeout after ${TIMEOUT_MS}ms`));
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

export const POST = wrap('cross-link-audit', async () => {
  const profileId = getActiveProfileId();
  try {
    await spawnAudit({ profileId });
    const out = path.join(profilePath(profileId, 'profile-dir'), 'cross-link-audit.json');
    if (!fs.existsSync(out)) {
      return { ok: false, error: 'Audit did not produce cross-link-audit.json' };
    }
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8')) as {
      findings: CrossLinkFinding[];
      mismatches: number;
      gaps: number;
      auditedAt: number;
    };
    logEvent('cross-link-audit', 'Audit complete', {
      level: parsed.mismatches > 0 ? 'warn' : 'success',
      category: 'system',
      message: `${parsed.mismatches} mismatches · ${parsed.gaps} gaps`,
    });
    return { ok: true, ...parsed };
  } catch (err) {
    reportServerError('cross-link-audit', 'Audit failed', err, { category: 'system' });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

export const GET = wrap('cross-link-audit', async () => {
  const profileId = getActiveProfileId();
  const out = path.join(profilePath(profileId, 'profile-dir'), 'cross-link-audit.json');
  if (!fs.existsSync(out)) {
    return { ok: true, findings: [], auditedAt: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
    return { ok: true, ...parsed };
  } catch {
    return { ok: true, findings: [], auditedAt: null };
  }
});
