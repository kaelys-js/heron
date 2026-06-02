/** Issue stream API -- public HTTP surface backed by data/issues.jsonl.
 *  GET → list open issues (newest first); GET ?include=resolved → all ever
 *  recorded; DELETE → clear resolved (doesn't touch open). POST resolves an
 *  issue by id: `{ id }` → mark that issue resolved.
 *
 *  Issues are PRODUCT-kind problems created server-side via reportIssue (dead
 *  posting, autopilot paused, integrity finding, …) -- the browser cannot
 *  CREATE one here. Client TECHNICAL diagnostics POST to /api/telemetry, which
 *  writes quiet activity events and never an Issue.
 *
 *  Distinct from the activity feed: issues are persistent open work, the feed
 *  is transient. The dashboard Inbox imports listOpenIssues() directly. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { listOpenIssues, listAllIssues, resolveIssue, clearResolved } from '$lib/server/issues';
import { logEvent } from '$lib/server/events';

export const GET = wrap('issues', async ({ url }: { url: URL }) => {
  const include = url.searchParams.get('include');
  if (include === 'resolved') {
    return { issues: listAllIssues() };
  }
  return { issues: listOpenIssues() };
});

export const POST = wrap('issues', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { id?: string } | null;

  // Resolve-by-id (dashboard "mark resolved" + tray) is the ONLY POST action.
  // Issue CREATION is server-only (reportIssue) -- a browser can't open an
  // Issue here; client diagnostics go to /api/telemetry instead.
  if (typeof body?.id !== 'string' || !body.id) {
    badRequest('id required to resolve an issue');
  }
  const resolved = resolveIssue(body!.id);
  if (!resolved) {
    badRequest('Issue not found: ' + body!.id);
  }
  logEvent('issues', `Issue resolved: ${resolved!.summary}`, {
    level: 'info',
    category: 'system',
    message: `source=${resolved!.source}`,
  });
  return { ok: true, issue: resolved };
});

export const DELETE = wrap('issues', async () => {
  const removed = clearResolved();
  return { ok: true, removed };
});
