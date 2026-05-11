/**
 * POST /api/profiles/active   { id }
 * Flip the active profile. The next page load picks up the new state via
 * the root layout-server loader.
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import { setActiveProfileId } from '$lib/server/profiles';
import { logEvent } from '$lib/server/events';

export const POST = wrap('profiles-active', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body || typeof body.id !== 'string' || !body.id.trim()) {
    badRequest('expected JSON body with { id: string }');
  }
  try {
    const state = setActiveProfileId(body.id);
    const next = state.profiles.find((p) => p.id === state.activeId);
    logEvent('profiles', 'Active profile switched', {
      level: 'info',
      category: 'user',
      message: 'now active: ' + (next?.name ?? state.activeId),
    });
    return state;
  } catch (e) {
    badRequest(e instanceof Error ? e.message : String(e));
  }
});
