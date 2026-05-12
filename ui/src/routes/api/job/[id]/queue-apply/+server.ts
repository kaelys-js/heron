/**
 * Queue-apply endpoint.
 *
 *   POST /api/job/[id]/queue-apply
 *
 * Stages the job for the autopilot apply-queue drain. Returns immediately —
 * the actual application is scheduled by the apply-queue-drain job (Task 1.2).
 *
 * Pre-flight checks:
 *   - Resolve the job + its profile (cross-profile-aware)
 *   - Refuse if status is already Applied / Applying / Queued (idempotent)
 *   - Refuse if today's apply count has hit the cap (gracefully — the user
 *     can retry tomorrow without losing the intent)
 *
 * Status flow set by this endpoint: Scored → Queued.
 * The drain takes it from Queued → Applying → Applied | ManualApplyNeeded.
 *
 * NB: this endpoint does NOT check `profile.automation.autonomous_apply`.
 * The user is explicitly clicking the Apply button — that's a per-action
 * consent, not a per-profile policy. The autopilot scheduled drain DOES
 * check the toggle (in apply-queue.job.ts) so background queue-pulls
 * respect the opt-in.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { markStatus } from '$lib/server/applications';
import { writeApplyState } from '$lib/server/apply-state';
import { detectPortal } from '$lib/server/apply-dispatcher';
import { todayCount } from '$lib/server/apply-counter';
import { readConfig } from '$lib/server/autopilot';
import { logEvent } from '$lib/server/events';

export const POST = wrap(
  'queue-apply',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    if (!job.url) badRequest('Job has no URL — cannot queue apply');

    // Idempotency: don't queue twice.
    const blocking = new Set(['Queued', 'Applying', 'Applied', 'Screened', 'Interview', 'Offer']);
    if (blocking.has(job.status)) {
      return {
        ok: false,
        already: job.status,
        message: 'Job already at status ' + job.status + ' — not re-queuing.',
      };
    }

    // Cap check — refuse to queue if today's already at cap. Don't bump the
    // counter here (that happens after a successful apply); just refuse.
    const cap = readConfig().thresholds.maxAppliesPerDay;
    if (todayCount() >= cap) {
      return {
        ok: false,
        capped: true,
        message:
          'Daily apply cap (' +
          cap +
          ') reached. Try again tomorrow or raise the cap on /autopilot.',
      };
    }

    // Flip status to Queued + seed apply-state.
    markStatus(profileId, job.url, 'Queued', 'Queued for autonomous apply');

    const portal = detectPortal(job.url).portal;
    writeApplyState({
      jobId: job.id,
      url: job.url,
      portal,
      profileId,
      startedAt: Date.now(),
      lastStep: 'queued',
      stepHistory: ['queued'],
    });

    logEvent('queue-apply', 'Queued for apply · ' + (job.company || '?'), {
      level: 'info',
      category: 'application',
      message: portal + ' · ' + job.url,
      profileId,
    });

    return {
      ok: true,
      status: 'Queued',
      portal,
      message:
        'Queued — the apply-queue drain will pick it up at its next run (or run it manually from /agents).',
    };
  },
);
