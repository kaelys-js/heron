/**
 * /api/profile/linkedin-audit — audit the user's LinkedIn profile for
 * recruiter SEARCH visibility (different from ATS keyword matching).
 *
 * POST body: { linkedinUrl: string }
 *
 * Two phases:
 *   1. Spawn extract-linkedin-profile.py to scrape the user's profile
 *      via their saved Playwright session (.playwright-linkedin/).
 *   2. Spawn the linkedin-audit Claude mode with the extracted text +
 *      cv.md + target_roles. Mode writes a structured audit markdown.
 *
 * Cost: 1 Playwright fetch (~5-10s) + 1 Claude pass (~30-60s). Cache
 * by date so re-running on the same day returns the existing audit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { readProfile } from '$lib/server/profile';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { logEvent, reportServerError } from '$lib/server/events';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  if (q && getProfile(q)) return q;
  return getActiveProfileId();
}

function venvPython(): string {
  const venv = path.join(ROOT, '.venv', 'bin', 'python');
  return fs.existsSync(venv) ? venv : 'python3';
}

function extractLinkedInText(linkedinUrl: string): { ok: boolean; text?: string; error?: string } {
  const r = spawnSync(
    venvPython(),
    [path.join(ROOT, 'extract-linkedin-profile.py'), '--url', linkedinUrl],
    { cwd: ROOT, encoding: 'utf8', timeout: 60_000 },
  );
  if (r.status !== 0) {
    const stderr = (r.stderr || '').slice(0, 300);
    if (r.status === 3)
      return {
        ok: false,
        error: 'LinkedIn session not connected — run linkedin-easy-apply.py --login from /sources',
      };
    if (r.status === 4)
      return {
        ok: false,
        error: 'Auth-wall hit — session may have expired, re-login from /sources',
      };
    return { ok: false, error: 'extract failed (exit ' + r.status + '): ' + stderr };
  }
  return { ok: true, text: r.stdout };
}

function spawnAudit(args: {
  profileId: string;
  linkedinText: string;
  cv: string;
  targetRoles: string[];
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const promptInput = {
      linkedinText: args.linkedinText.slice(0, 30_000),
      cvBytes: args.cv.length,
      targetRoles: args.targetRoles,
    };
    const prompt = '/' + CLI_NAMESPACE + ' linkedin-audit';
    try {
      swapProfileSymlinks(args.profileId);
    } catch {}
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: {
        ...process.env,
        LINKEDIN_AUDIT_INPUT: JSON.stringify(promptInput),
        LINKEDIN_PROFILE_TEXT: args.linkedinText,
      },
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

function parseAuditStdout(stdout: string): {
  auditPath?: string;
  recruiterVisibilityScore?: number;
  headlineGap?: boolean;
  missingKeywords?: number;
  suggestedEdits?: number;
} {
  const grabStr = (re: RegExp): string | undefined => {
    const m = re.exec(stdout);
    return m ? m[1].trim() : undefined;
  };
  const grabNum = (re: RegExp): number | undefined => {
    const v = grabStr(re);
    if (!v) return undefined;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const gap = grabStr(/HEADLINE_GAP:\s*(yes|no)/i);
  return {
    auditPath: grabStr(/AUDIT_PATH:\s*(\S+)/),
    recruiterVisibilityScore: grabNum(/RECRUITER_VISIBILITY_SCORE:\s*([\d.]+)/),
    headlineGap: gap === 'yes',
    missingKeywords: grabNum(/MISSING_KEYWORDS:\s*(\d+)/),
    suggestedEdits: grabNum(/SUGGESTED_EDITS:\s*(\d+)/),
  };
}

export const GET = wrap('linkedin-audit', async ({ url }: { url: URL }) => {
  // Return the most recent audit file (if any) for the dashboard to render.
  const profileId = resolveProfileId(url);
  const dir = profilePath(profileId, 'profile-dir');
  if (!fs.existsSync(dir)) return { exists: false };
  const entries = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('linkedin-audit-') && f.endsWith('.md'));
  if (entries.length === 0) return { exists: false };
  entries.sort();
  const newest = entries[entries.length - 1];
  const full = path.join(dir, newest);
  const stat = fs.statSync(full);
  return {
    exists: true,
    path: path.relative(ROOT, full),
    body: fs.readFileSync(full, 'utf8'),
    lastUpdatedAt: stat.mtimeMs,
  };
});

export const POST = wrap(
  'linkedin-audit',
  async ({ url, request }: { url: URL; request: Request }) => {
    const profileId = resolveProfileId(url);
    const body = (await request.json().catch(() => ({}))) as { linkedinUrl?: string };
    if (!body.linkedinUrl) badRequest('linkedinUrl required');

    logEvent('linkedin-audit', 'Starting audit', {
      level: 'info',
      category: 'application',
      message: body.linkedinUrl!,
    });

    try {
      // Phase 1: extract profile text.
      const ext = extractLinkedInText(body.linkedinUrl!);
      if (!ext.ok) return { ok: false, error: ext.error };

      // Phase 2: read cv.md + targetRoles from profile.
      const cvPath = profilePath(profileId, 'cv-md');
      const cv = fs.existsSync(cvPath) ? fs.readFileSync(cvPath, 'utf8') : '';
      if (!cv) return { ok: false, error: 'cv.md not found — onboarding not complete' };
      const profile = readProfile(profileId) as unknown as {
        target_roles?: { primary?: string[]; archetypes?: Array<{ name: string }> };
      };
      const targetRoles: string[] = [
        ...(profile?.target_roles?.primary ?? []),
        ...(profile?.target_roles?.archetypes ?? []).map((a) => a.name),
      ];

      const { stdout } = await spawnAudit({
        profileId,
        linkedinText: ext.text!,
        cv,
        targetRoles,
      });
      const meta = parseAuditStdout(stdout);

      logEvent('linkedin-audit', 'Audit complete', {
        level: 'success',
        category: 'application',
        message:
          'Score ' +
          (meta.recruiterVisibilityScore ?? '?') +
          '/10' +
          ' · ' +
          (meta.suggestedEdits ?? '?') +
          ' suggested edits',
      });

      return { ok: true, ...meta };
    } catch (err) {
      reportServerError('linkedin-audit', 'Audit failed', err, { category: 'application' });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
