/** /api/health -- minimal liveness probe. Returns a static {ok, version}
 *  blob so the "is the backend reachable" probe (used by backend-discovery
 *  BEFORE sign-in) is anonymous-safe. F22: must NOT return per-file stats
 *  (size + mtime) for the active user's pipeline.md / gemini-scores.tsv
 *  / reports/ count -- ALS resolves to SYSTEM_USER on an anonymous request,
 *  which would leak the OWNER's pipeline shape (file size ≈ job count,
 *  mtime ≈ "when did the owner last scan") to anyone who can reach the
 *  backend. Per-user numbers live on authenticated endpoints
 *  (/api/stats, /api/insights). */

import { wrap } from '$lib/server/api-helpers';

export const GET = wrap('health', async () => {
  return {
    ok: true,
    // Backend-discovery uses this endpoint as a "is this URL Heron?"
    // probe. Returning a stable signature lets the client confirm
    // without enumerating versions on the unauthenticated surface
    // (returning the actual semver would let attackers fingerprint
    // CVE-vulnerable installs).
    service: 'heron',
  };
});
