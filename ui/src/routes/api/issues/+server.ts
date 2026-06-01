/** Issue stream API -- public HTTP surface backed by data/issues.jsonl.
 *  GET → list open issues (newest first); GET ?include=resolved → all ever
 *  recorded; DELETE → clear resolved (doesn't touch open). POST is overloaded:
 *    • `{ id }`                  → mark that issue resolved
 *    • `{ summary | title, … }`  → CREATE an issue (the client error-reporter's
 *                                  ingestion path: browser / Electron-main /
 *                                  iOS-native errors land in the same store the
 *                                  Inbox shows). Tagged to the request's auth
 *                                  user via reportIssue's context.
 *  Distinct from the activity feed: issues are persistent open work, the feed
 *  is transient. The dashboard Inbox imports listOpenIssues() directly. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  listOpenIssues,
  listAllIssues,
  resolveIssue,
  clearResolved,
  reportIssue,
} from '$lib/server/issues';
import { logEvent } from '$lib/server/events';
import type { Issue } from '$lib/types';

/** Shape the client error-reporter (sendToBackend) POSTs. All optional except
 *  one of summary/title; extra fields are folded into the issue's detail. */
type ClientIssueBody = {
  source?: string;
  level?: string;
  title?: string;
  summary?: string;
  stack?: string;
  jobId?: string;
  userAction?: string;
  route?: string;
  requestId?: string;
  data?: unknown;
  dedupeKey?: string;
};

/** Compose the persisted Issue.detail (markdown-ish) from the client report's
 *  optional diagnostics. The correlation id (X-Request-Id, surfaced by api.ts /
 *  the page meta) rides here since Issue has no dedicated requestId field --
 *  it's the pivot a maintainer uses to find the matching server log line. */
function buildClientIssueDetail(b: ClientIssueBody): string | undefined {
  const parts: string[] = [];
  if (b.route) {
    parts.push(`Route: ${b.route}`);
  }
  if (b.requestId) {
    parts.push(`Request ID: ${b.requestId}`);
  }
  if (b.userAction) {
    parts.push(`Action: ${b.userAction}`);
  }
  if (b.jobId) {
    parts.push(`Job: ${b.jobId}`);
  }
  if (b.data !== undefined) {
    try {
      parts.push(`Data: ${JSON.stringify(b.data)}`);
    } catch {
      /* non-serializable -- skip */
    }
  }
  if (b.stack) {
    parts.push(`\n${String(b.stack).slice(0, 4000)}`);
  }
  const detail = parts.join('\n');
  return detail ? detail.slice(0, 6000) : undefined;
}

export const GET = wrap('issues', async ({ url }: { url: URL }) => {
  const include = url.searchParams.get('include');
  if (include === 'resolved') {
    return { issues: listAllIssues() };
  }
  return { issues: listOpenIssues() };
});

export const POST = wrap('issues', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as
    | ({ id?: string } & ClientIssueBody)
    | null;

  // Resolve-by-id (dashboard "mark resolved" + tray) -- takes precedence.
  if (typeof body?.id === 'string' && body.id) {
    const resolved = resolveIssue(body.id);
    if (!resolved) {
      badRequest('Issue not found: ' + body.id);
    }
    logEvent('issues', `Issue resolved: ${resolved!.summary}`, {
      level: 'info',
      category: 'system',
      message: `source=${resolved!.source}`,
    });
    return { ok: true, issue: resolved };
  }

  // Create -- the client error-reporter's ingestion path. reportIssue tags the
  // issue to the request's auth user (via user-context) and dedupes on
  // dedupeKey, so a repeated client error collapses to one open row.
  const summary = String(body?.summary ?? body?.title ?? '').trim();
  if (!summary) {
    badRequest('id required to resolve an issue, or summary/title to create one');
  }
  const severity: Issue['severity'] =
    body?.level === 'info' || body?.level === 'warn' ? body.level : 'error';
  const issue = reportIssue({
    severity,
    source: String(body?.source ?? 'client').slice(0, 64),
    summary: summary.slice(0, 200),
    detail: buildClientIssueDetail(body ?? {}),
    dedupeKey: typeof body?.dedupeKey === 'string' ? body.dedupeKey : undefined,
  });
  return { ok: true, issue };
});

export const DELETE = wrap('issues', async () => {
  const removed = clearResolved();
  return { ok: true, removed };
});
