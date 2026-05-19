/**
 * Per-profile CRUD endpoints (scoped to the current user).
 *
 *   PATCH /api/profiles/[id]  { name?, color? }     -- rename / recolor
 *   DELETE /api/profiles/[id]                       -- remove from list + wipe its dir
 *
 * DELETE refuses to remove the last profile (the system needs at least one).
 * Deleting the active profile flips active to the oldest remaining profile.
 *
 * `[id]` in the URL is the profile SLUG (kebab-case), not the DB UUID --
 * that's the legacy public identifier we preserve for client compat.
 */
import fs from 'node:fs';
import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  deleteProfileFor,
  renameProfileFor,
  recolorProfileFor,
  getProfileBySlug,
  getActiveProfile,
  listProfilesForUser,
  type ProfileColor,
  PROFILE_COLORS,
} from '$lib/server/profiles-db';
import { requireUserId } from '$lib/server/auth-helpers';
import { profilePath } from '$lib/server/profile-paths';
import { logEvent } from '$lib/server/events';

export const PATCH = wrap(
  'profiles-update',
  async ({
    params,
    request,
    locals,
  }: {
    params: { id: string };
    request: Request;
    locals: App.Locals;
  }) => {
    const userId = requireUserId(locals);
    const id = params.id;
    if (!getProfileBySlug(userId, id)) badRequest('Unknown profile: ' + id);
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      color?: string;
    } | null;
    if (!body) badRequest('expected JSON body with name? and/or color?');
    let updated = getProfileBySlug(userId, id)!;
    if (typeof body.name === 'string' && body.name.trim()) {
      updated = renameProfileFor(userId, id, body.name);
    }
    if (typeof body.color === 'string' && PROFILE_COLORS.includes(body.color as ProfileColor)) {
      updated = recolorProfileFor(userId, id, body.color as ProfileColor);
    }
    logEvent('profiles', 'Profile updated', {
      level: 'info',
      category: 'user',
      message: updated.name + ' (' + updated.slug + ')',
    });
    return {
      profile: {
        id: updated.slug,
        name: updated.name,
        color: updated.color,
        createdAt: updated.createdAt,
        lastActiveAt: updated.updatedAt,
      },
    };
  },
);

export const DELETE = wrap(
  'profiles-delete',
  async ({
    params,
    request,
    locals,
  }: {
    params: { id: string };
    request: Request;
    locals: App.Locals;
  }) => {
    const userId = requireUserId(locals);
    const id = params.id;
    if (!getProfileBySlug(userId, id)) badRequest('Unknown profile: ' + id);
    const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
    if (!body || body.confirm !== 'DELETE') {
      badRequest('Profile deletion requires { confirm: "DELETE" } in the body.');
    }

    try {
      deleteProfileFor(userId, id);
    } catch (e) {
      badRequest(e instanceof Error ? e.message : String(e));
    }

    // Remove the profile's directory tree. This is destructive -- the caller
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

    const list = listProfilesForUser(userId);
    const active = getActiveProfile(userId);
    const state = {
      activeId: active?.slug ?? list[0]?.slug ?? 'default',
      profiles: list.map((p) => ({
        id: p.slug,
        name: p.name,
        color: p.color,
        createdAt: p.createdAt,
        lastActiveAt: p.updatedAt,
      })),
    };

    logEvent('profiles-delete', 'Profile deleted', {
      level: 'warn',
      category: 'user',
      message: 'Removed ' + id + ' · active now ' + state.activeId,
    });
    return { state };
  },
);
