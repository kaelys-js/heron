/** POST /api/job/[id]/queue-apply -- stage the job for the autopilot apply-
 *  queue drain (Task 1.2). Returns immediately; the drain schedules the actual
 *  apply. Pre-flight: resolve job + profile (cross-profile-aware); refuse if
 *  status already Applied/Applying/Queued (idempotent); refuse if today's cap
 *  hit. Flow: Scored → Queued; drain takes it Queued → Applying → Applied |
 *  ManualApplyNeeded. Does NOT check automation.autonomous_apply -- explicit
 *  click is per-action consent. The scheduled drain (apply-queue.job.ts)
 *  honours the toggle for background pulls. */

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
    if (!resolved) {
      badRequest('Job not found: ' + params.id);
    }
    const { job, profileId } = resolved!;
    if (!job.url) {
      badRequest('Job has no URL — cannot queue apply');
    }

    // Idempotency: don't queue twice.
    const blocking = new Set(['Queued', 'Applying', 'Applied', 'Screened', 'Interview', 'Offer']);
    if (blocking.has(job.status)) {
      return {
        ok: false,
        already: job.status,
        message: `Job already at status ${job.status} — not re-queuing.`,
      };
    }

    // Cap check -- refuse to queue if today's already at cap. Don't bump the
    // counter here (that happens after a successful apply); just refuse.
    const cap = readConfig().thresholds.maxAppliesPerDay;
    if (todayCount() >= cap) {
      return {
        ok: false,
        capped: true,
        message: `Daily apply cap (${
          cap
        }) reached. Try again tomorrow or raise the cap on /autopilot.`,
      };
    }

    // Flip status to Queued + seed apply-state.
    markStatus(profileId, job.url, 'Queued', 'Queued for autonomous apply');

    const { portal } = detectPortal(job.url);
    writeApplyState({
      jobId: job.id,
      url: job.url,
      portal,
      profileId,
      startedAt: Date.now(),
      lastStep: 'queued',
      stepHistory: ['queued'],
    });

    logEvent('queue-apply', `Queued for apply · ${job.company || '?'}`, {
      level: 'info',
      category: 'application',
      message: `${portal} · ${job.url}`,
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
