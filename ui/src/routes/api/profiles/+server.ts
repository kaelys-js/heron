/**
 * GET /api/profiles            → list every profile for the current user
 * POST /api/profiles { name, color? } → create a new profile (and make it active)
 *
 * Multi-user: every read/write is scoped to `locals.user.id` via the
 * userId-aware helpers in `profiles-db.ts`. The response shape keeps the
 * legacy `{ activeId, profiles: [...] }` envelope so existing clients
 * (sidebar profile switcher, onboarding wizard, etc.) don't need to
 * change.
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  listProfilesForUser,
  getActiveProfile,
  createProfileFor,
  type ProfileColor,
  PROFILE_COLORS,
} from '$lib/server/profiles-db';
import { ensureProfileDirs } from '$lib/server/profile-paths';
import { logEvent } from '$lib/server/events';
import { requireUserId } from '$lib/server/auth-helpers';

export const GET = wrap('profiles', async ({ locals }: { locals: App.Locals }) => {
  const userId = requireUserId(locals);
  const list = listProfilesForUser(userId);
  const active = getActiveProfile(userId);
  return {
    activeId: active?.slug ?? list[0]?.slug ?? 'default',
    profiles: list.map((p) => ({
      id: p.slug, // legacy clients consume `id` as the slug
      name: p.name,
      color: p.color,
      createdAt: p.createdAt,
      lastActiveAt: p.updatedAt,
    })),
  };
});

export const POST = wrap(
  'profiles-create',
  async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const userId = requireUserId(locals);
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      color?: string;
    } | null;
    if (!body || typeof body.name !== 'string' || !body.name.trim()) {
      badRequest('expected JSON body with { name: string, color?: string }');
    }
    const color: ProfileColor =
      body.color && PROFILE_COLORS.includes(body.color as ProfileColor)
        ? (body.color as ProfileColor)
        : 'blue';
    try {
      const profile = createProfileFor(userId, body.name, color);
      ensureProfileDirs(profile.slug);
      logEvent('profiles-create', 'Profile created', {
        level: 'info',
        category: 'user',
        message: profile.name + ' (' + profile.slug + ')',
      });
      return {
        profile: {
          id: profile.slug,
          name: profile.name,
          color: profile.color,
          createdAt: profile.createdAt,
          lastActiveAt: profile.updatedAt,
        },
      };
    } catch (e) {
      badRequest(e instanceof Error ? e.message : String(e));
    }
  },
);
