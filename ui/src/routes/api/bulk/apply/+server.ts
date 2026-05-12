/**
 * Bulk apply.
 *
 * POST { jobIds: string[] } → splits requested jobs by source:
 *   * LinkedIn URLs → queued for linkedin-easy-apply.py via the orchestrator
 *   * Other URLs   → status flipped to Applied here (the client opens the
 *     posting in a new tab on its end so the user can finish the form fill;
 *     server can't open browser tabs)
 *
 * Returns a summary so the client can render a confirmation toast and a list
 * of "open these in tabs" URLs.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { runBulkApply } from '$lib/server/orchestrator';
import { markApplied } from '$lib/server/applications';
import { logEvent, reportServerError } from '$lib/server/events';

const MAX_BULK = 50;

type Group = { id: string; url: string; company: string; role: string; isLinkedIn: boolean };

export const POST = wrap('bulk-apply', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { jobIds?: string[] } | null;
  const ids = Array.isArray(body?.jobIds)
    ? body!.jobIds.filter((s): s is string => typeof s === 'string')
    : [];
  if (ids.length === 0) badRequest('jobIds required (non-empty array)');
  if (ids.length > MAX_BULK) badRequest('At most ' + MAX_BULK + ' jobs per bulk run');

  const jobs = loadAllJobs();
  const groups: Group[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const j = jobs.find((x) => x.id === id);
    if (!j?.url) {
      missing.push(id);
      continue;
    }
    groups.push({
      id: j.id,
      url: j.url,
      company: j.company || '',
      role: j.role || '',
      isLinkedIn: /linkedin\.com/.test(j.url),
    });
  }
  if (groups.length === 0) badRequest('No jobs found for the given ids');

  const linkedIn = groups.filter((g) => g.isLinkedIn);
  const others = groups.filter((g) => !g.isLinkedIn);

  // Mark non-LinkedIn jobs Applied immediately. The client opens those URLs in
  // new tabs — server-side state must reflect "user has committed to apply" so
  // they don't double-process.
  for (const g of others) {
    try {
      markApplied(g.url, g.company, g.role);
    } catch (e: any) {
      logEvent('bulk-apply', 'Failed to mark Applied: ' + g.url, {
        level: 'error',
        category: 'application',
        message: e?.message ?? String(e),
      });
    }
  }
  if (others.length > 0) {
    logEvent('bulk-apply', others.length + ' jobs marked Applied', {
      level: 'success',
      category: 'application',
      message: 'Open the postings in new tabs to finish the manual form fill',
    });
  }

  // Fire LinkedIn pipeline async — orchestrator drives the activity feed.
  if (linkedIn.length > 0) {
    runBulkApply(linkedIn.map((g) => ({ url: g.url, isLinkedIn: true }))).catch((err) =>
      reportServerError('bulk-apply', 'LinkedIn bulk-apply rejected', err, { category: 'task' }),
    );
  }

  return {
    ok: true,
    linkedInCount: linkedIn.length,
    otherCount: others.length,
    missing,
    /** URLs the client should open in new tabs after this returns */
    openInTabs: others.map((g) => ({ id: g.id, url: g.url, company: g.company, role: g.role })),
    message:
      (linkedIn.length > 0 ? 'Auto-applying ' + linkedIn.length + ' via LinkedIn. ' : '') +
      (others.length > 0
        ? 'Marked ' + others.length + ' Applied · open postings in new tabs to finish.'
        : ''),
  };
});
