/**
 * Queue batch send.
 *
 *   POST /api/queue/send  { jobIds: string[] }
 *
 * Splits the jobs by source:
 *   - LinkedIn URLs → kicked off via runLinkedInApply (one at a time)
 *   - others        → marked Applied immediately + their URLs returned in
 *                     `openInTabs` so the client can open them
 *
 * Same shape as /api/bulk/apply but specifically for Queued jobs (the
 * /queue page passes the already-filtered list). Respects the autopilot
 * `maxAppliesPerDay` cap by trimming the LinkedIn portion if needed.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { runBulkApply } from '$lib/server/orchestrator';
import { markApplied } from '$lib/server/applications';
import { readConfig } from '$lib/server/autopilot';
import { logEvent, reportServerError } from '$lib/server/events';

const MAX_BATCH = 50;

export const POST = wrap('queue-send', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { jobIds?: string[] } | null;
  const ids = Array.isArray(body?.jobIds)
    ? body!.jobIds.filter((s): s is string => typeof s === 'string')
    : [];
  if (ids.length === 0) badRequest('jobIds required (non-empty array)');
  if (ids.length > MAX_BATCH) badRequest('At most ' + MAX_BATCH + ' jobs per send');

  const allJobs = loadAllJobs();
  type Pick = { id: string; url: string; company: string; role: string; isLinkedIn: boolean };
  const picks: Pick[] = [];
  for (const id of ids) {
    const j = allJobs.find((x) => x.id === id);
    if (!j?.url) continue;
    if (j.status !== 'Queued') continue;
    picks.push({
      id: j.id,
      url: j.url,
      company: j.company,
      role: j.role,
      isLinkedIn: /linkedin\.com/.test(j.url),
    });
  }
  if (picks.length === 0) badRequest('No Queued jobs found for the given ids');

  const cfg = readConfig();
  const cap = cfg.thresholds?.maxAppliesPerDay ?? 30;
  const linkedIn = picks.filter((p) => p.isLinkedIn);
  const others = picks.filter((p) => !p.isLinkedIn);

  // Trim LinkedIn portion if we'd exceed the daily cap. We treat 'others'
  // (open-and-mark) as not counting against the cap since they need a human
  // to actually finish the form.
  const linkedInToSend = linkedIn.slice(0, cap);

  for (const g of others) {
    try {
      markApplied(g.url, g.company, g.role);
    } catch (err: any) {
      logEvent('queue-send', 'Failed to mark Applied: ' + g.url, {
        level: 'error',
        category: 'application',
        message: err?.message ?? String(err),
      });
    }
  }
  if (others.length > 0) {
    logEvent('queue-send', others.length + ' jobs marked Applied from queue', {
      level: 'success',
      category: 'application',
      message: 'Open postings in new tabs to finish form fill',
    });
  }

  if (linkedInToSend.length > 0) {
    runBulkApply(linkedInToSend.map((g) => ({ url: g.url, isLinkedIn: true }))).catch((err) =>
      reportServerError('queue-send', 'LinkedIn queue dispatch rejected', err, {
        category: 'task',
      }),
    );
  }

  return {
    ok: true,
    linkedInQueued: linkedInToSend.length,
    linkedInDeferred: linkedIn.length - linkedInToSend.length,
    otherCount: others.length,
    cap,
    openInTabs: others.map((g) => ({ id: g.id, url: g.url, company: g.company, role: g.role })),
    message:
      (linkedInToSend.length > 0
        ? 'Auto-applying ' + linkedInToSend.length + ' via LinkedIn. '
        : '') +
      (linkedIn.length - linkedInToSend.length > 0
        ? '(' + (linkedIn.length - linkedInToSend.length) + ' deferred — daily cap.) '
        : '') +
      (others.length > 0
        ? 'Marked ' + others.length + ' Applied · open postings in new tabs to finish.'
        : ''),
  };
});
