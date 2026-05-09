/**
 * scan-all — single-entry-point fan-out across every active scanner.
 *
 * Runs (in parallel, since they don't share state):
 *   • scan-portals  (scan.mjs)        — direct ATS APIs
 *   • scan          (scan-broad.py)   — JobSpy + free aggregators
 *   • scan-curated  (scan-curated.mjs) — niche boards (AI Jobs)
 *   • scan-email    (scan-email.mjs)   — only if data/inbox-mbox has files
 *
 * scan-vc is intentionally NOT in the fan-out — it produces candidate
 * COMPANIES, not jobs, and the user manually reviews its TSV. It runs on
 * its own weekly schedule.
 *
 * After every child finishes, a single summary event is emitted with the
 * combined count so the bell shows one rollup instead of four. The
 * `auto-triage` chain still fires off each child individually since each
 * emits its own success event.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { runById, has as hasJob } from './registry';
import { register } from './registry';
import { getSource } from '../sources';
import type { JobArgs, JobResult } from './types';

const INBOX_MBOX = path.join(ROOT, 'data', 'inbox-mbox');

function inboxHasMbox(): boolean {
  try {
    if (!fs.existsSync(INBOX_MBOX)) return false;
    return fs.readdirSync(INBOX_MBOX).some(n => n.toLowerCase().endsWith('.mbox'));
  } catch {
    return false;
  }
}

async function runScanAll(args?: JobArgs): Promise<JobResult> {
  // Each child must be registered (orchestrator + registry imports run at
  // boot via jobs/index.ts). hasJob guards against partial-boot races.
  // Authenticated scanners (linkedin-auth, indeed-auth) only join the
  // fan-out when their source is connected — otherwise they'd just exit
  // early with a "not connected" error and clutter the activity feed.
  const children: Array<{ id: string; args?: JobArgs }> = [];
  if (hasJob('scan-portals')) children.push({ id: 'scan-portals' });
  if (hasJob('scan'))         children.push({ id: 'scan' });
  if (hasJob('scan-curated')) children.push({ id: 'scan-curated' });
  if (hasJob('scan-linkedin-auth') && getSource('linkedin-auth').connected) {
    children.push({ id: 'scan-linkedin-auth' });
  }
  if (hasJob('scan-indeed-auth') && getSource('indeed-auth').connected) {
    children.push({ id: 'scan-indeed-auth' });
  }
  if (hasJob('scan-email-imap') && getSource('gmail-imap').connected) {
    children.push({ id: 'scan-email-imap' });
  }
  if (hasJob('scan-email') && inboxHasMbox()) children.push({ id: 'scan-email' });

  if (children.length === 0) {
    logEvent('scan-all', 'Nothing to scan', {
      level: 'warn',
      category: 'task',
      message: 'No registered scanners found. Did jobs/index.ts boot cleanly?',
    });
    return { ok: false, error: 'no scanners registered' };
  }

  logEvent('scan-all', 'Scan-all dispatched', {
    level: 'info',
    category: 'task',
    message: 'fan-out: ' + children.map(c => c.id).join(', '),
  });

  // Parallel — each writes to pipeline.md / scan-history.tsv with its own
  // dedup pass, so order doesn't matter.
  const results = await Promise.allSettled(
    children.map(c => runById(c.id, c.args)),
  );

  let totalFound = 0;
  let okCount = 0;
  let failCount = 0;
  const breakdown: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const id = children[i].id;
    if (r.status === 'fulfilled' && r.value.ok) {
      okCount++;
      const found = (r.value.meta as { found?: number } | undefined)?.found ?? 0;
      totalFound += found;
      breakdown.push(id + '=' + found);
    } else {
      failCount++;
      const err = r.status === 'rejected'
        ? (r.reason instanceof Error ? r.reason.message : String(r.reason))
        : (r.value.ok === false ? r.value.error : 'unknown');
      breakdown.push(id + '=fail(' + (err || '?').slice(0, 40) + ')');
    }
  }

  logEvent('scan-all', 'Scan-all finished', {
    level: failCount === 0 ? 'success' : (okCount > 0 ? 'warn' : 'error'),
    category: 'task',
    message: totalFound + ' total · ' + breakdown.join(' · '),
  });

  // JobResult is a discriminated union — `ok: boolean` doesn't fit either
  // arm, so split on the actual outcome.
  const message = totalFound + ' jobs across ' + okCount + '/' + children.length + ' scanners';
  if (failCount < children.length) {
    return { ok: true, message, meta: { totalFound, okCount, failCount, breakdown } };
  }
  return { ok: false, error: 'All scanners failed: ' + breakdown.join('; '), meta: { totalFound, okCount, failCount, breakdown } };
}

register({
  id: 'scan-all',
  label: 'Scan all sources',
  description: 'Fan-out across every active scanner (portals, broad, curated, email). Single entry point, single summary event, parallel.',
  category: 'discovery',
  // Daily 09:00 weekdays — same slot the broad scan used to occupy. The
  // child after-trigger chains (auto-triage etc) still fire as each child
  // finishes, so behaviour is unchanged from the user's perspective.
  trigger: { type: 'daily', hour: 9, minute: 0, weekdays: [1, 2, 3, 4, 5] },
  allowManual: true,
  run: runScanAll,
});

export { runScanAll };
