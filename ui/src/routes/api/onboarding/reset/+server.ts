/**
 * POST /api/onboarding/reset -- owner-only.
 *
 * Wipes the install's onboarding state file so the wizard re-runs on the
 * next page load. Doesn't delete user content (cv.md, profile.yml, etc.)
 * but the onboarding-state file is install-wide (data/onboarding-state.json),
 * not per-user -- so only the owner should be able to flip it.
 */
import { wrap } from '$lib/server/api-helpers';
import { requireOwner } from '$lib/server/auth-helpers';
import { reset } from '$lib/server/onboarding';
import { logEvent } from '$lib/server/events';

export const POST = wrap('onboarding-reset', async ({ locals }: { locals: App.Locals }) => {
  requireOwner(locals);
  const state = reset();
  logEvent('onboarding', 'Onboarding state reset', {
    level: 'info',
    category: 'system',
    message: 'Wizard will re-run on next page load. Config files preserved.',
  });
  return { state };
});
