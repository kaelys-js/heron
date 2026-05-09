/**
 * POST /api/onboarding/complete
 *
 * Flips the `completed: true` flag — fresh-install redirect now passes.
 * Used by the Done step's "Open Inbox" button AND the Welcome page's
 * "Skip — I've set up by hand" link (with `{ skip: true }`).
 *
 * Idempotent. Doesn't touch cv.md / profile.yml / portals.yml.
 */
import { wrap } from '$lib/server/api-helpers';
import { markComplete } from '$lib/server/onboarding';
import { logEvent } from '$lib/server/events';

export const POST = wrap('onboarding-complete', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => ({}));
  const skip = !!body?.skip;
  const state = markComplete();
  logEvent('onboarding', skip ? 'Onboarding skipped (advanced)' : 'Onboarding complete', {
    level: skip ? 'info' : 'success',
    category: 'system',
    message: state.completedSteps.length + ' / ' + 6 + ' steps completed',
  });
  return { state };
});
