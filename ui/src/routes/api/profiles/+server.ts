/**
 * GET /api/profiles → list every profile + active id.
 */
import { wrap } from '$lib/server/api-helpers';
import { readProfiles } from '$lib/server/profiles';

export const GET = wrap('profiles', async () => {
  return readProfiles();
});
