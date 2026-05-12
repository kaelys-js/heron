/**
 * POST /api/profile/cross-link-audit
 *
 * Validates that the user's CV, profile.yml, and the linked external
 * profiles (GitHub, LinkedIn, personal portfolio) tell the SAME story.
 *
 * Recruiters Google candidates. If your CV says "Senior Engineer at
 * AcmeCo" but your LinkedIn says "Lead Engineer at AcmeCo" — that
 * inconsistency raises a red flag.
 *
 * Checks performed:
 *   1. Name match across all surfaces
 *   2. Current role + title match
 *   3. Most-recent employer match
 *   4. Years-of-experience implied by each surface lines up
 *   5. Project list from CV vs. pinned repos on GitHub
 *   6. Skills listed match the skills the user owns on LinkedIn
 *
 * Spawns the `cross-link-audit` mode which does the actual fetching +
 * comparison. Output: JSON summary written to
 * `data/users/.../profiles/.../cross-link-audit.json`.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { wrap } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { getActiveProfileId } from '$lib/server/profiles';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';

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
    const prompt = '/' + CLI_NAMESPACE + ' cross-link-audit ' + JSON.stringify(payload);
    try {
      swapProfileSymlinks(args.profileId);
    } catch {}
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env, CROSS_LINK_INPUT: JSON.stringify(payload) },
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
      reject(new Error('cross-link-audit timeout after ' + TIMEOUT_MS + 'ms'));
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

export const POST = wrap('cross-link-audit', async () => {
  const profileId = getActiveProfileId();
  try {
    await spawnAudit({ profileId });
    const out = path.join(profilePath(profileId, 'profile-dir'), 'cross-link-audit.json');
    if (!fs.existsSync(out))
      return { ok: false, error: 'Audit did not produce cross-link-audit.json' };
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8')) as {
      findings: CrossLinkFinding[];
      mismatches: number;
      gaps: number;
      auditedAt: number;
    };
    logEvent('cross-link-audit', 'Audit complete', {
      level: parsed.mismatches > 0 ? 'warn' : 'success',
      category: 'system',
      message: parsed.mismatches + ' mismatches · ' + parsed.gaps + ' gaps',
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
  if (!fs.existsSync(out)) return { ok: true, findings: [], auditedAt: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
    return { ok: true, ...parsed };
  } catch {
    return { ok: true, findings: [], auditedAt: null };
  }
});
