/**
 * Follow-up cadence snapshot (HTTP surface).
 *
 *   GET             → cached snapshot (≤5min stale ok)
 *   GET ?fresh=1    → force re-spawn the script (slower but live)
 *
 * Note on consumers: the dashboard's page loaders (/applied, Inbox,
 * JobActions sheet) call `getFollowupCadence()` via SERVER-SIDE import
 * from `$lib/server/followup-cadence`, not via this HTTP endpoint --
 * cheaper than a round trip and avoids a network hop. This endpoint
 * remains as the public surface for external integrations (bookmarklets,
 * scripts, mobile clients) that want the same JSON shape over HTTP.
 */

import { wrap } from '$lib/server/api-helpers';
import { getFollowupCadence } from '$lib/server/followup-cadence';

export const GET = wrap('followup-cadence', async ({ url }: { url: URL }) => {
  const fresh = url.searchParams.get('fresh') === '1';
  const cadence = await getFollowupCadence({ force: fresh });
  return cadence;
});
