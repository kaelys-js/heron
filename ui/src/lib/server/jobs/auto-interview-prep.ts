/**
 * Auto-fire interview prep when a job transitions to status=Interview.
 *
 * /api/status emits a success event with title 'Status changed to Interview'
 * (and source='status') for every status update. We watch for that exact
 * shape and spawn generateInterviewPrep() in the background so the brief
 * is waiting on the Interview Prep tab when the user opens it.
 *
 * Runs at most one prep at a time per jobId — duplicate flips while the
 * first generation is in flight are dropped (the persisted file from the
 * winning run will be served on next read either way).
 *
 * Boot path: imported from `jobs/index.ts`. The bus listener installs
 * exactly once.
 */

import { installBusListener, logEvent, reportServerError } from '../events';
import { generateInterviewPrep, readPersistedInterviewPrep } from '../interview';
import { loadAllJobs } from '../parsers';
import type { ActivityEvent } from '$lib/types';

const inFlight = new Set<string>();

function installAutoInterviewPrep(): void {
  // installBusListener is idempotent across HMR — see events.ts.
  installBusListener('auto-interview-prep', (ev: ActivityEvent) => {
    // We only care about "Status changed to Interview" success events
    if (ev.level !== 'success') return;
    if (ev.source !== 'status') return;
    if (!/Status changed to Interview\b/i.test(ev.title)) return;

    // The status endpoint puts "<company> · <role>" in the message field.
    // Match the row in applications.md by company+role to find the jobId.
    const message = ev.message ?? '';
    const [companyRaw, roleRaw] = message.split('·').map((s) => s.trim());
    if (!companyRaw) return;

    const jobs = loadAllJobs();
    const match = jobs.find(
      (j) =>
        j.company.trim().toLowerCase() === companyRaw.toLowerCase() &&
        (!roleRaw || j.role.trim().toLowerCase() === roleRaw.toLowerCase()),
    );
    if (!match) return;
    if (!match.reportFile) {
      // No deep eval yet — the prep would be empty; skip.
      return;
    }
    if (inFlight.has(match.id)) return;
    if (readPersistedInterviewPrep(match.id)) {
      // Already have a prep on disk — don't burn tokens regenerating.
      return;
    }

    inFlight.add(match.id);
    logEvent('auto-interview-prep', 'Pre-generating interview brief', {
      level: 'info',
      category: 'task',
      message: match.company + ' · ' + match.role,
    });
    (async () => {
      try {
        await generateInterviewPrep(match.reportFile!, undefined, match.id);
        logEvent('auto-interview-prep', 'Interview brief ready', {
          level: 'success',
          category: 'task',
          message: match.company + ' · ' + match.role + ' — open the Interview Prep tab',
        });
      } catch (err) {
        reportServerError('auto-interview-prep', 'Brief generation failed', err, {
          category: 'task',
        });
      } finally {
        inFlight.delete(match.id);
      }
    })().catch(() => {});
  });
}

// Boot-time install — called from jobs/index.ts. Idempotent on HMR reload.
installAutoInterviewPrep();
