/**
 * Generic job-registry API.
 *
 *   GET /api/jobs           → list every registered job (summary form, no
 *                              `run` function). Drives the Agents page,
 *                              Autopilot dropdown, and admin tools.
 *
 * The legacy /api/run endpoint is preserved for the original 3 task ids
 * (scan, gemini, apply-linkedin) so existing UI code keeps working without
 * a change. New code should prefer /api/jobs/[id]/run for new task types.
 */

import { wrap } from '$lib/server/api-helpers';
import { listSummaries } from '$lib/server/jobs';

export const GET = wrap('jobs', async () => ({ jobs: listSummaries() }));
