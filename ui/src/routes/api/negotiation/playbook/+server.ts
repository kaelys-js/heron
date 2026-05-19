/**
 * /api/negotiation/playbook -- return the static negotiation playbook.
 *
 * GET → { decisionTree, nonCompAsks, dontAcceptVerbally, tierBands }
 *
 * Static structured data (no Claude call). The /negotiation page renders
 * this as a navigable wizard the user reads BEFORE a real negotiation
 * call. Distinct from POST /api/negotiation which spawns Claude to draft
 * a per-job negotiation brief -- both are useful, different times.
 */

import { wrap } from '$lib/server/api-helpers';
import { loadPlaybook } from '$lib/server/negotiation-playbook';

export const GET = wrap('negotiation-playbook', async () => loadPlaybook());
