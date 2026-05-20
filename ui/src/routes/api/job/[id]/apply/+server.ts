/**
 * Per-job apply API.
 *
 *   mode: 'mark'           → flip status to Applied (no script, manual flow)
 *   mode: 'linkedin'       → spawn linkedin-easy-apply.py --url <that one>
 *   mode: 'open-and-mark'  → flip status to Applied (the UI is responsible for
 *                            opening the posting in a new tab on the client
 *                            since browsers won't open one from server code)
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { runLinkedInApply } from '$lib/server/orchestrator';
import { markApplied } from '$lib/server/applications';
import { logEvent } from '$lib/server/events';

type ApplyMode = 'mark' | 'linkedin' | 'open-and-mark';

/**
 * Hostname-exact match for LinkedIn. CodeQL flagged the previous
 * `url.includes('linkedin.com')` shape under `js/incomplete-url-substring-sanitization`
 * because attacker-controlled URLs like `https://evil.example/?u=linkedin.com`
 * pass the substring test. Parse + check hostname instead.
 */
function isLinkedInHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'linkedin.com' || host.endsWith('.linkedin.com');
  } catch {
    return false;
  }
}

export const POST = wrap(
  'job-apply',
  async ({ params, request, url }: { params: { id: string }; request: Request; url: URL }) => {
    const body = (await request.json().catch(() => null)) as { mode?: string } | null;
    const mode = (body?.mode ?? 'mark') as ApplyMode;
    if (mode !== 'mark' && mode !== 'linkedin' && mode !== 'open-and-mark') {
      badRequest('mode must be "mark", "linkedin", or "open-and-mark"');
    }

    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;

    if (mode === 'linkedin') {
      // Hostname-based check (CodeQL js/incomplete-url-substring-sanitization):
      // raw-string .includes('linkedin.com') would also match attacker.example/?u=linkedin.com.
      if (!isLinkedInHost(job.url)) {
        badRequest('Job URL is not on LinkedIn — only Easy Apply jobs can be auto-applied');
      }
      // Pass profileId so easy-apply spawns with --profile + uses that profile's
      // cv-general.pdf instead of the active profile's.
      runLinkedInApply(false, job.url, profileId);
      return {
        ok: true,
        mode,
        message: 'LinkedIn Easy Apply started for this job — open the activity feed to follow.',
      };
    }

    // 'mark' and 'open-and-mark' both flip status to Applied in the job's
    // PROFILE tracker (not the currently-active one).
    markApplied(profileId, job.url, job.company, job.role);
    logEvent('job-apply', 'Marked Applied: ' + (job.company || job.url), {
      level: 'success',
      category: 'application',
      message: job.role,
    });
    return {
      ok: true,
      mode,
      message:
        mode === 'open-and-mark' ? 'Opened posting · marked as Applied' : 'Marked as Applied',
    };
  },
);
