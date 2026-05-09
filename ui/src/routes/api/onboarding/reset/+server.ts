/**
 * POST /api/onboarding/reset
 *
 * Reset onboarding state so the wizard re-runs on next page load.
 * Does NOT delete cv.md, profile.yml, portals.yml, etc — just wipes
 * the state file. Used by the Settings page's "Re-run onboarding" button.
 */
import { wrap } from '$lib/server/api-helpers';
import { reset } from '$lib/server/onboarding';
import { logEvent } from '$lib/server/events';

export const POST = wrap('onboarding-reset', async () => {
  const state = reset();
  logEvent('onboarding', 'Onboarding state reset', {
    level: 'info',
    category: 'system',
    message: 'Wizard will re-run on next page load. Config files preserved.',
  });
  return { state };
});
