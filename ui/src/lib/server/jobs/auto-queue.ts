/** Auto-flip Ready → Queued after CV generation finishes. Listens for
 *  runEvaluate's 'Generate CV finished' success event (URL in message
 *  field), looks up the job, bumps status to Queued so it appears on
 *  /queue for batch send. Skips jobs not currently in Ready (preserves
 *  manual flips) and jobs already ≥ Queued (idempotent).
 *  Status update is fire-and-forget via /api/status (normalize.job +
 *  dedup.job chain off that).
 *  F11 multi-user: re-enters runAsUser(ev.userId, …) because the bus
 *  emit may originate from a background tick or spawn callback with
 *  no ALS context. Untagged events are skipped. */

import { installBusListener, logEvent, reportServerError } from '../events';
import { loadAllJobs } from '../parsers';
import { markStatus } from '../applications';
import { runAsUser } from '../user-context';
import type { ActivityEvent } from '$lib/types';

function installAutoQueue(): void {
  // installBusListener is idempotent across HMR -- see events.ts.
  installBusListener('auto-queue', (ev: ActivityEvent) => {
    if (ev.level !== 'success') {
      return;
    }
    if (ev.source !== 'evaluate') {
      return;
    }
    if (!/Generate CV finished/i.test(ev.title)) {
      return;
    }

    // Message format set by runEvaluate: 'Report + tailored CV PDF generated · <url>'
    const m = (ev.message ?? '').match(/\bhttps?:\/\/\S+/);
    if (!m) {
      return;
    }
    const url = m[0].replace(/[)\].,>]+$/, '');

    // F11 -- anchor to ev.userId. Without it we'd potentially flip the
    // wrong user's job row (or write to SYSTEM_USER's tree).
    const ownerUserId = ev.userId;
    if (!ownerUserId) {
      // Broadcast / untagged event. Don't guess -- log a warn so it
      // surfaces in /runtimes if it ever fires in real traffic.
      logEvent('auto-queue', 'Skipping untagged evaluate event', {
        level: 'warn',
        category: 'application',
        message: `event has no userId — cannot scope to a profile · url=${url}`,
      });
      return;
    }

    // Fire-and-forget -- the bus listener signature is sync, so we kick
    // off the async work inside an IIFE. runAsUser preserves ALS through
    // every await boundary downstream.
    void runAsUser(ownerUserId, async () => {
      const job = loadAllJobs().find((j) => j.url === url);
      if (!job) {
        return;
      }
      if (job.status !== 'Ready' && job.status !== 'Scored' && job.status !== 'New') {
        return;
      }

      try {
        markStatus(url, 'Queued', 'auto-queued: CV ready for batch send');
        logEvent('auto-queue', 'Job queued for batch send', {
          level: 'info',
          category: 'application',
          message: `${job.company || '?'} · ${job.role || '?'} — review on /queue`,
        });
      } catch (err) {
        reportServerError('auto-queue', 'Status flip failed', err, { category: 'application' });
      }
    });
  });
}

installAutoQueue();
