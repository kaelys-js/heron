/** GET /api/jobs -- list every registered job (summary form, no `run` fn).
 *  The Agents page loader uses listSummaries() directly via $lib/server/jobs;
 *  this endpoint is the public HTTP surface for external integrations.
 *  /api/run is preserved for the original 3 task ids (scan, gemini,
 *  apply-linkedin). New task types use /api/jobs/[id]/run, which the Agents
 *  page wires its Run buttons to for non-legacy jobs. */

import { wrap } from '$lib/server/api-helpers';
import { listSummaries } from '$lib/server/jobs';

export const GET = wrap('jobs', async () => ({ jobs: listSummaries() }));
