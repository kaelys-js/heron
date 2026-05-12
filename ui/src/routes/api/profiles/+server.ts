/**
 * GET /api/profiles            → list every profile + active id
 * POST /api/profiles { name, color? } → create a new profile (and make it active)
 *
 * POST is used by the onboarding wizard's "?new=1" entry — the user types
 * a display name, picks a color, and we derive the slug + persist. The
 * newly-created profile becomes active immediately so subsequent step
 * pages write to its files.
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  readProfiles,
  createProfile,
  type ProfileColor,
  PROFILE_COLORS,
} from '$lib/server/profiles';
import { ensureProfileDirs } from '$lib/server/profile-paths';
import { logEvent } from '$lib/server/events';

export const GET = wrap('profiles', async () => {
  return readProfiles();
});

export const POST = wrap('profiles-create', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { name?: string; color?: string } | null;
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    badRequest('expected JSON body with { name: string, color?: string }');
  }
  const color: ProfileColor =
    body.color && PROFILE_COLORS.includes(body.color as ProfileColor)
      ? (body.color as ProfileColor)
      : 'blue';
  try {
    const profile = createProfile(body.name, color);
    ensureProfileDirs(profile.id);
    logEvent('profiles-create', 'Profile created', {
      level: 'info',
      category: 'user',
      message: profile.name + ' (' + profile.id + ')',
    });
    return { profile };
  } catch (e) {
    badRequest(e instanceof Error ? e.message : String(e));
  }
});
