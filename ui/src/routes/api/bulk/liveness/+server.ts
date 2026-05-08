/**
 * Bulk liveness sweep.
 *
 * POST { scope?: 'stale' | 'all' | 'urls', urls?: string[] }
 *
 * Fire-and-forget — the orchestrator runs the sweep, streams progress events,
 * and the caller polls /api/run or watches the activity feed for completion.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { runById } from '$lib/server/jobs';

export const POST = wrap('bulk-liveness', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as
    | { scope?: 'stale' | 'all' | 'urls'; urls?: string[] }
    | null;
  const args: Record<string, unknown> = {};
  if (body?.scope) {
    if (!['stale', 'all', 'urls'].includes(body.scope)) {
      badRequest('scope must be stale | all | urls');
    }
    if (body.scope === 'urls') {
      if (!Array.isArray(body.urls) || body.urls.length === 0) {
        badRequest('scope=urls requires a non-empty urls[] array');
      }
      args.urls = body.urls;
    } else {
      args.scope = body.scope;
    }
  }
  // Fire and forget — the activity feed is the source of truth for progress.
  runById('liveness', args).catch(() => {});
  return { ok: true, message: 'Liveness sweep queued — watch the activity feed.' };
});
