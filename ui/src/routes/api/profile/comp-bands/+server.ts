/** /api/profile/comp-bands -- read merged bands + write overrides. GET →
 *  { bands (defaults overlaid with per-profile overrides), staleness:
 *  { stale, ageMonths, hasOverrides } }. POST body { key, band: { band?,
 *  base?, total?, notes? } } upserts an override for one tier key; partial
 *  fields fall through to the default. DELETE body { key } removes the
 *  override so the default kicks back in. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  mergedBands,
  writeOverride,
  deleteOverride,
  bandsAreStale,
  type BandOverride,
} from '$lib/server/comp-bands-overrides';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  if (q && getProfile(q)) return q;
  return getActiveProfileId();
}

export const GET = wrap('comp-bands', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  return {
    bands: mergedBands(profileId),
    staleness: bandsAreStale(profileId),
  };
});

export const POST = wrap('comp-bands', async ({ url, request }: { url: URL; request: Request }) => {
  const profileId = resolveProfileId(url);
  const body = (await request.json().catch(() => ({}))) as Partial<BandOverride>;
  if (!body.key || !body.band) badRequest('key + band required');
  const row = writeOverride(profileId, { key: body.key, band: body.band });
  return { ok: true, row };
});

export const DELETE = wrap('comp-bands', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  const key = url.searchParams.get('key');
  if (!key) badRequest('key required');
  const removed = deleteOverride(profileId, key);
  return { ok: removed };
});
