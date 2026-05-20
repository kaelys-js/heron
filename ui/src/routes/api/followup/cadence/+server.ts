/** Follow-up cadence snapshot (HTTP surface).
 *    GET           → cached snapshot (≤5min stale ok)
 *    GET ?fresh=1  → force re-spawn the script (slower, live)
 *  Dashboard page loaders (/applied, Inbox, JobActions sheet) call
 *  getFollowupCadence() via server-side import from
 *  $lib/server/followup-cadence -- cheaper than a round trip. This
 *  endpoint exists for external integrations (bookmarklets, scripts,
 *  mobile clients) that want the same JSON shape over HTTP. */

import { wrap } from '$lib/server/api-helpers';
import { getFollowupCadence } from '$lib/server/followup-cadence';

export const GET = wrap('followup-cadence', async ({ url }: { url: URL }) => {
  const fresh = url.searchParams.get('fresh') === '1';
  const cadence = await getFollowupCadence({ force: fresh });
  return cadence;
});
