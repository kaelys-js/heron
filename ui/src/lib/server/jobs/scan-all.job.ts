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
    return fs.readdirSync(INBOX_MBOX).some((n) => n.toLowerCase().endsWith('.mbox'));
  } catch {
    return false;
  }
}

async function runScanAll(args?: JobArgs): Promise<JobResult> {
  // Fan-out across every profile × every active scanner.
  //
  // Phase 4: scan-all now iterates profiles. Each profile gets the same
  // set of child scanners; each child receives the profile slug so its
  // output lands in data/profiles/{slug}/. Profiles run SEQUENTIALLY to
  // avoid hammering rate limits when a user has 3+ profiles (each scanner
  // would otherwise fire 3 concurrent LinkedIn/Indeed sessions).
  //
  // Within a profile, scanners run in PARALLEL (existing behavior preserved).
  const { listProfiles } = await import('../profiles');
  const profiles = listProfiles();

  const baseChildren: Array<string> = [];
  if (hasJob('scan-portals')) baseChildren.push('scan-portals');
  if (hasJob('scan')) baseChildren.push('scan');
  if (hasJob('scan-curated')) baseChildren.push('scan-curated');
  // P9: skip the authenticated scrapers when their `consecutiveFailures`
  // counter is non-zero — re-firing into a dead session just produces more
  // failures (and eventually a 3-strike disconnect). The user has to
  // re-login from /sources to clear the counter.
  if (hasJob('scan-linkedin-auth')) {
    const s = getSource('linkedin-auth');
    if (s.connected && (s.consecutiveFailures ?? 0) === 0) {
      baseChildren.push('scan-linkedin-auth');
    } else if (s.connected) {
      logEvent('scan-all', 'Skipping scan-linkedin-auth — recent failures', {
        level: 'warn',
        category: 'task',
        message:
          'consecutiveFailures=' +
          (s.consecutiveFailures ?? 0) +
          '. Re-login via /sources to clear.',
      });
    }
  }
  if (hasJob('scan-indeed-auth')) {
    const s = getSource('indeed-auth');
    if (s.connected && (s.consecutiveFailures ?? 0) === 0) {
      baseChildren.push('scan-indeed-auth');
    } else if (s.connected) {
      logEvent('scan-all', 'Skipping scan-indeed-auth — recent failures', {
        level: 'warn',
        category: 'task',
        message:
          'consecutiveFailures=' +
          (s.consecutiveFailures ?? 0) +
          '. Re-login via /sources to clear.',
      });
    }
  }
  if (hasJob('scan-email-imap') && getSource('gmail-imap').connected) {
    baseChildren.push('scan-email-imap');
  }
  if (hasJob('scan-email') && inboxHasMbox()) baseChildren.push('scan-email');

  if (baseChildren.length === 0) {
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
    message:
      profiles.length +
      ' profile(s) × ' +
      baseChildren.length +
      ' scanner(s): ' +
      baseChildren.join(', '),
  });

  // For each profile, fan out scanners in parallel. Profiles iterate
  // sequentially to bound concurrent network load.
  type ChildResult = { id: string; profileId: string; ok: boolean; meta?: unknown; error?: string };
  const results: ChildResult[] = [];
  for (const profile of profiles) {
    const profileArgs = { ...(args ?? {}), profileId: profile.id };
    const settled = await Promise.allSettled(baseChildren.map((id) => runById(id, profileArgs)));
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        results.push({ id: baseChildren[i], profileId: profile.id, ok: true, meta: r.value.meta });
      } else {
        const err =
          r.status === 'rejected'
            ? r.reason instanceof Error
              ? r.reason.message
              : String(r.reason)
            : r.value.ok === false
              ? r.value.error
              : 'unknown';
        results.push({ id: baseChildren[i], profileId: profile.id, ok: false, error: err });
      }
    }
  }

  let totalFound = 0;
  let okCount = 0;
  let failCount = 0;
  const breakdown: string[] = [];
  for (const r of results) {
    if (r.ok) {
      okCount++;
      const found = (r.meta as { found?: number } | undefined)?.found ?? 0;
      totalFound += found;
      breakdown.push(r.profileId + '/' + r.id + '=' + found);
    } else {
      failCount++;
      breakdown.push(r.profileId + '/' + r.id + '=fail(' + (r.error || '?').slice(0, 40) + ')');
    }
  }

  logEvent('scan-all', 'Scan-all finished', {
    level: failCount === 0 ? 'success' : okCount > 0 ? 'warn' : 'error',
    category: 'task',
    message: totalFound + ' total · ' + breakdown.join(' · '),
  });

  const totalChildren = results.length;
  const message = totalFound + ' jobs across ' + okCount + '/' + totalChildren + ' runs';
  if (failCount < totalChildren) {
    return { ok: true, message, meta: { totalFound, okCount, failCount, breakdown } };
  }
  return {
    ok: false,
    error: 'All scanners failed: ' + breakdown.join('; '),
    meta: { totalFound, okCount, failCount, breakdown },
  };
}

register({
  id: 'scan-all',
  label: 'Scan all sources',
  description:
    'Fan-out across every active scanner (portals, broad, curated, email). Single entry point, single summary event, parallel.',
  category: 'discovery',
  // Daily 09:00 weekdays — same slot the broad scan used to occupy. The
  // child after-trigger chains (auto-triage etc) still fire as each child
  // finishes, so behaviour is unchanged from the user's perspective.
  trigger: { type: 'daily', hour: 9, minute: 0, weekdays: [1, 2, 3, 4, 5] },
  allowManual: true,
  run: runScanAll,
});

// D24 — `runScanAll` was only used by the registry; export removed.
