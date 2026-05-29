import { wrap, badRequest } from '$lib/server/api-helpers';
import { readProfile, writeProfile } from '$lib/server/profile';
import type { ProfileEdit } from '$lib/server/profile';
import { getProfile, getActiveProfileId } from '$lib/server/profiles';
import { logEvent } from '$lib/server/events';

/**
 * /api/profile -- read/write the user's profile.yml for the targeted profile.
 *
 *   GET  /api/profile[?profile=<slug>]              -- read
 *   POST /api/profile[?profile=<slug>] { …edit }    -- write
 *
 * When `?profile=<slug>` is omitted (or the slug doesn't match a real
 * profile), the active profile is used. Used by:
 *   - the wizard's identity / cv / targeting steps (POST after each)
 *   - the /profile management page (lets user edit any profile)
 */

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  return q && getProfile(q) ? q : getActiveProfileId();
}

export const GET = wrap('profile', async ({ url }: { url: URL }) =>
  readProfile(resolveProfileId(url)),
);

export const POST = wrap('profile', async ({ request, url }: { request: Request; url: URL }) => {
  const body = (await request.json().catch(() => null)) as ProfileEdit | null;
  if (!body || typeof body !== 'object') {
    badRequest('expected JSON profile patch');
  }
  const id = resolveProfileId(url);
  const next = writeProfile(id, body);
  logEvent('profile', 'Profile updated', {
    level: 'success',
    category: 'user',
    message: `profile=${id}`,
  });
  return next;
});
