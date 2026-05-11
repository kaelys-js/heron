/**
 * Generic job-registry API.
 *
 *   GET /api/jobs           → list every registered job (summary form, no
 *                              `run` function). Consumed by the Agents page
 *                              loader (which uses listSummaries() directly
 *                              via $lib/server/jobs, but this endpoint
 *                              remains as the public HTTP surface for
 *                              external integrations).
 *
 * The legacy /api/run endpoint is preserved for the original 3 task ids
 * (scan, gemini, apply-linkedin) so existing UI code keeps working without
 * a change. New code should prefer /api/jobs/[id]/run for new task types —
 * the Agents page wires its Run buttons to that endpoint for any
 * non-legacy registered job.
 */

import { wrap } from '$lib/server/api-helpers';
import { listSummaries } from '$lib/server/jobs';

export const GET = wrap('jobs', async () => ({ jobs: listSummaries() }));
