/**
 * Per-profile CRUD endpoints.
 *
 *   PATCH /api/profiles/[id]  { name?, color? }     — rename / recolor
 *   DELETE /api/profiles/[id]                       — remove from list + wipe its dir
 *
 * DELETE refuses to remove the last profile (the system needs at least one).
 * Deleting the active profile flips active to the first remaining profile.
 */
import fs from 'node:fs';
import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  deleteProfile,
  renameProfile,
  recolorProfile,
  getProfile,
  type ProfileColor,
  PROFILE_COLORS,
} from '$lib/server/profiles';
import { profilePath } from '$lib/server/profile-paths';
import { logEvent } from '$lib/server/events';

export const PATCH = wrap(
  'profiles-update',
  async ({ params, request }: { params: { id: string }; request: Request }) => {
    const id = params.id;
    if (!getProfile(id)) badRequest('Unknown profile: ' + id);
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      color?: string;
    } | null;
    if (!body) badRequest('expected JSON body with name? and/or color?');
    let updated = getProfile(id)!;
    if (typeof body.name === 'string' && body.name.trim()) {
      updated = renameProfile(id, body.name);
    }
    if (typeof body.color === 'string' && PROFILE_COLORS.includes(body.color as ProfileColor)) {
      updated = recolorProfile(id, body.color as ProfileColor);
    }
    logEvent('profiles', 'Profile updated', {
      level: 'info',
      category: 'user',
      message: updated.name + ' (' + updated.id + ')',
    });
    return { profile: updated };
  },
);

export const DELETE = wrap(
  'profiles-delete',
  async ({ params, request }: { params: { id: string }; request: Request }) => {
    const id = params.id;
    if (!getProfile(id)) badRequest('Unknown profile: ' + id);
    const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
    if (!body || body.confirm !== 'DELETE') {
      badRequest('Profile deletion requires { confirm: "DELETE" } in the body.');
    }

    let state;
    try {
      state = deleteProfile(id);
    } catch (e) {
      badRequest(e instanceof Error ? e.message : String(e));
    }

    // Remove the profile's directory tree. This is destructive — the caller
    // is responsible for the type-DELETE confirmation gate above.
    const dir = profilePath(id, 'profile-dir');
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      logEvent('profiles-delete', 'Profile rm failed (state already updated)', {
        level: 'warn',
        category: 'user',
        message: dir + ' — ' + (e instanceof Error ? e.message : String(e)),
      });
    }

    logEvent('profiles-delete', 'Profile deleted', {
      level: 'warn',
      category: 'user',
      message: 'Removed ' + id + ' · active now ' + state!.activeId,
    });
    return { state };
  },
);
