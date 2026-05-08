import { wrap } from '$lib/server/api-helpers';
import { resumeAutopilot } from '$lib/server/autopilot-circuit-breaker';

/**
 * POST /api/autopilot/resume
 * Re-enables autopilot after a circuit-breaker trip and clears the open
 * circuit-breaker issue. Used by the Inbox banner's "Resume" action.
 */
export const POST = wrap('autopilot-resume', async () => {
  const r = resumeAutopilot();
  return r;
});
