/**
 * POST /api/profiles/active   { id }
 *
 * Flip the active profile for the current user. Scoped per-user via the
 * userId from `locals.user`. The next page load picks up the new state
 * via the root layout-server loader.
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import { setActiveProfile, listProfilesForUser, getActiveProfile } from '$lib/server/profiles-db';
import { requireUserId } from '$lib/server/auth-helpers';
import { logEvent } from '$lib/server/events';

export const POST = wrap(
  'profiles-active',
  async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const userId = requireUserId(locals);
    const body = (await request.json().catch(() => null)) as { id?: string } | null;
    if (!body || typeof body.id !== 'string' || !body.id.trim()) {
      badRequest('expected JSON body with { id: string }');
    }
    try {
      const next = setActiveProfile(userId, body.id);
      logEvent('profiles', 'Active profile switched', {
        level: 'info',
        category: 'user',
        message: 'now active: ' + next.name,
      });
      const list = listProfilesForUser(userId);
      const active = getActiveProfile(userId);
      return {
        activeId: active?.slug ?? list[0]?.slug ?? 'default',
        profiles: list.map((p) => ({
          id: p.slug,
          name: p.name,
          color: p.color,
          createdAt: p.createdAt,
          lastActiveAt: p.updatedAt,
        })),
      };
    } catch (e) {
      badRequest(e instanceof Error ? e.message : String(e));
    }
  },
);
