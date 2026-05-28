/** POST /api/onboarding/complete -- flips `completed: true` so the fresh-
 *  install redirect passes. Used by Done step's "Open Inbox" and the Welcome
 *  page's "Skip" link ({ skip: true }). Idempotent. Doesn't touch cv.md /
 *  profile.yml / portals.yml. Side effect: fires seed-form-answers in the
 *  background to pre-populate the cache so the first autonomous-apply
 *  doesn't dead-end on unknown-field (notice period, visa status). Fire-
 *  and-forget; re-triggerable from /profile. */
import { wrap } from '$lib/server/api-helpers';
import { markComplete } from '$lib/server/onboarding';
import { logEvent } from '$lib/server/events';
import { getActiveProfileId } from '$lib/server/profiles';
import { spawnAgentWithMode } from '$lib/server/spawn-agent';

function fireAndForgetSeedFormAnswers(profileId: string): void {
  try {
    // seed-form-answers takes no per-job input; pass an empty user
    // message and let the mode prompt do everything via the realized
    // __PROFILE_MD__ etc. tokens.
    const { child: p } = spawnAgentWithMode('seed-form-answers', '', { profileId });
    // Detach so the seed continues if the dashboard worker is recycled.
    p.unref();
    logEvent('seed-form-answers', 'Background seed fired from onboarding complete', {
      level: 'info',
      category: 'application',
    });
  } catch (err) {
    logEvent('seed-form-answers', 'Failed to fire background seed', {
      level: 'warn',
      category: 'application',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export const POST = wrap('onboarding-complete', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => ({}));
  const skip = !!body?.skip;
  const state = markComplete();
  logEvent('onboarding', skip ? 'Onboarding skipped (advanced)' : 'Onboarding complete', {
    level: skip ? 'info' : 'success',
    category: 'system',
    message: `${state.completedSteps.length} / ${6} steps completed`,
  });

  // Fire the form-answers seed in the background. We do this on BOTH
  // normal-completion and skip paths -- even an "advanced" user who set
  // up by hand benefits from the pre-populated cache. Skipped if the
  // user has no CV yet (the seed mode will exit non-zero, which is fine).
  if (!skip) {
    try {
      fireAndForgetSeedFormAnswers(getActiveProfileId());
    } catch {
      /* logged inside */
    }
  }

  return { state };
});
