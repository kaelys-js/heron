/**
 * Issue stream API -- public HTTP surface for external integrations.
 *
 *   GET                    → list open issues (newest first)
 *   GET ?include=resolved  → list every issue ever recorded
 *   POST { id }            → mark the given issue resolved
 *   DELETE                 → clear every resolved issue from the file
 *                             (audit-trail housekeeping; doesn't touch open ones)
 *
 * Backed by data/issues.jsonl. Distinct from the activity feed: issues are
 * persistent open work, the feed is transient information.
 *
 * Note: the dashboard's Inbox loader reads `listOpenIssues()` via direct
 * server-side import (cheaper than a round-trip). This HTTP endpoint exists
 * so external integrations -- CLI scripts, mobile clients, the bookmarklet
 * -- can consume the same JSON shape over HTTP.
 */

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
  if (!body?.id) badRequest('id required to resolve an issue');
  const resolved = resolveIssue(body.id);
  if (!resolved) badRequest('Issue not found: ' + body.id);
  logEvent('issues', 'Issue resolved: ' + resolved!.summary, {
    level: 'info',
    category: 'system',
    message: 'source=' + resolved!.source,
  });
  return { ok: true, issue: resolved };
});

export const DELETE = wrap('issues', async () => {
  const removed = clearResolved();
  return { ok: true, removed };
});
