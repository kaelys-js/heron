/**
 * POST /api/linkedin/audit/rewrite
 *   body: { findings?: string[] }   -- kind values to rewrite; defaults
 *                                     to all unresolved text-fix findings
 *
 * Spawns the `linkedin-rewrite` mode which drafts paste-ready text per
 * section. Output saved to `output/linkedin-rewrite-{date}.md`.
 */

import { wrap } from '$lib/server/api-helpers';
import { logEvent, reportServerError } from '$lib/server/events';
import { getActiveProfileId } from '$lib/server/profiles';
import { readAuditReport } from '$lib/server/linkedin-audit';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
const TIMEOUT_MS = 240_000;

function spawnRewrite(args: {
  profileId: string;
  findings: string[];
  snapshot: Record<string, unknown>;
}): Promise<{ stdout: string }> {
  return new Promise((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    const payload = {
      profileId: args.profileId,
      findings: args.findings,
      snapshot: args.snapshot,
    };

    const { child: p } = spawnAgentWithMode(
      'linkedin-rewrite',
      JSON.stringify({
        profileId: args.profileId,
        findings: args.findings,
        snapshotSummary: {
          headlineLength: ((args.snapshot.profile as Record<string, string>)?.headline ?? '')
            .length,
          aboutLength: ((args.snapshot.profile as Record<string, string>)?.about ?? '').length,
        },
      }),
      {
        profileId: args.profileId,
        env: { LINKEDIN_REWRITE_INPUT: JSON.stringify(payload) },
      },
    );
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
      reject(new Error('linkedin-rewrite timeout after ' + TIMEOUT_MS + 'ms'));
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

function parseRewritePath(stdout: string): string | undefined {
  const m = /REWRITE_PATH:\s*(\S+)/.exec(stdout);
  return m ? m[1].trim() : undefined;
}

export const POST = wrap('linkedin-rewrite', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { findings?: string[] };
  const profileId = getActiveProfileId();
  const report = readAuditReport(profileId);
  if (!report) return { ok: false, error: 'Run /api/linkedin/audit first to produce a report' };
  // Default: all unresolved findings that aren't pure settings-flip items
  const defaultKinds = report.findings
    .filter((f) => !f.resolvedAt && !f.settingsPath)
    .map((f) => f.kind);
  const findings = body.findings ?? defaultKinds;
  if (findings.length === 0) {
    return { ok: true, message: 'Nothing to rewrite — all text-fix findings are resolved' };
  }
  try {
    const { stdout } = await spawnRewrite({
      profileId,
      findings,
      snapshot: report.snapshot,
    });
    const rewritePath = parseRewritePath(stdout);
    logEvent('linkedin-rewrite', 'Rewrite drafted', {
      level: 'success',
      category: 'user',
      message: rewritePath ?? '(no path emitted)',
    });
    return { ok: true, rewritePath };
  } catch (err) {
    reportServerError('linkedin-rewrite', 'Rewrite failed', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
