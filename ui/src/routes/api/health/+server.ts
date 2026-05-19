/**
 * /api/health -- minimal liveness probe.
 *
 * F22 -- pre-fix this returned per-file stats (size + mtime) for the
 * active user's pipeline.md + gemini-scores.tsv + reports/ count. The
 * endpoint is anonymous (backend-discovery uses it before sign-in
 * lands), so on a multi-user install ALS resolved to SYSTEM_USER and
 * leaked the OWNER's pipeline metadata (file size ≈ job count, mtime ≈
 * "when did the owner last scan") to anyone who could reach the
 * backend.
 *
 * Now: returns a static {ok, version} blob. The "is the backend
 * reachable" semantic is preserved; the "what does the owner's
 * pipeline look like" leak is closed. Authenticated endpoints
 * (/api/stats, /api/insights) carry the per-user numbers behind auth.
 *
 * @module
 */

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
