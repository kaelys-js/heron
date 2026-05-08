import { wrap, badRequest } from '$lib/server/api-helpers';
import { readConfig, patchConfig, type AutopilotConfig } from '$lib/server/autopilot';
import { logEvent } from '$lib/server/events';

export const GET = wrap('autopilot', async () => readConfig());

export const POST = wrap('autopilot', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') badRequest('expected JSON body with config patch');
  const patch = body as Partial<AutopilotConfig>;
  const next = patchConfig(patch);
  // Activity-feed entry. info level so the client doesn't double-toast over
  // the page's own "Autopilot saved" success toast.
  const enabled = next.schedules.filter((s) => s.enabled).length;
  logEvent('autopilot', 'Autopilot config saved', {
    level: 'info',
    category: 'user',
    message: enabled + ' / ' + next.schedules.length + ' schedules enabled',
  });
  return { config: next };
});
