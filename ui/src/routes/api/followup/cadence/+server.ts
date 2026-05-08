/**
 * Follow-up cadence snapshot.
 *
 *   GET             → cached snapshot (≤5min stale ok)
 *   GET ?fresh=1    → force re-spawn the script (slower but live)
 *
 * Drives:
 *   - /applied page badges (per-row urgency)
 *   - Inbox "Follow-ups due" section
 *   - JobActions "Draft follow-up" menu (it reads the cached entry to
 *     prefill the persona / days-since-applied context)
 */

import { wrap } from '$lib/server/api-helpers';
import { getFollowupCadence } from '$lib/server/followup-cadence';

export const GET = wrap('followup-cadence', async ({ url }: { url: URL }) => {
  const fresh = url.searchParams.get('fresh') === '1';
  const cadence = await getFollowupCadence({ force: fresh });
  return cadence;
});
