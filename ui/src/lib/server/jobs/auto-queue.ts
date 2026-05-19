/**
 * Auto-flip Ready → Queued after CV generation finishes.
 *
 * runEvaluate() emits a 'Generate CV finished' success event with the URL in
 * the message field once the report + PDF are written to disk. We intercept
 * that, look up the job, and bump its status to Queued so it lands on the
 * /queue page for batch send.
 *
 * Skips:
 *   - Jobs that aren't currently in Ready (preserves manual status flips)
 *   - Jobs that already have status >= Queued (idempotent on re-runs)
 *
 * Status update is fire-and-forget via the existing /api/status helper --
 * normalize.job + dedup.job already chain off that.
 *
 * Multi-user safety (F11): the listener fires inside whatever ALS context
 * the emitting code held -- which is usually correct (events fired from a
 * /api/* request inherit the request's user context). BUT the emit can
 * also happen from a background tick OR from spawn-completion callbacks
 * that have lost the original context. So we re-enter the user context
 * explicitly via `runAsUser(ev.userId, …)` before calling `loadAllJobs()`
 * / `markStatus()` -- both of which read+write per-user data.
 *
 * If the event isn't tagged with a userId (broadcast event or pre-F11
 * emit), we skip -- better to no-op than to write into the wrong user's
 * tree.
 */

import { installBusListener, logEvent, reportServerError } from '../events';
import { loadAllJobs } from '../parsers';
import { markStatus } from '../applications';
import { runAsUser } from '../user-context';
import type { ActivityEvent } from '$lib/types';

function installAutoQueue(): void {
  // installBusListener is idempotent across HMR -- see events.ts.
  installBusListener('auto-queue', (ev: ActivityEvent) => {
    if (ev.level !== 'success') return;
    if (ev.source !== 'evaluate') return;
    if (!/Generate CV finished/i.test(ev.title)) return;

    // Message format set by runEvaluate: 'Report + tailored CV PDF generated · <url>'
    const m = (ev.message ?? '').match(/\bhttps?:\/\/\S+/);
    if (!m) return;
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
        message: 'event has no userId — cannot scope to a profile · url=' + url,
      });
      return;
    }

    // Fire-and-forget -- the bus listener signature is sync, so we kick
    // off the async work inside an IIFE. runAsUser preserves ALS through
    // every await boundary downstream.
    void runAsUser(ownerUserId, async () => {
      const job = loadAllJobs().find((j) => j.url === url);
      if (!job) return;
      if (job.status !== 'Ready' && job.status !== 'Scored' && job.status !== 'New') return;

      try {
        markStatus(url, 'Queued', 'auto-queued: CV ready for batch send');
        logEvent('auto-queue', 'Job queued for batch send', {
          level: 'info',
          category: 'application',
          message: (job.company || '?') + ' · ' + (job.role || '?') + ' — review on /queue',
        });
      } catch (err) {
        reportServerError('auto-queue', 'Status flip failed', err, { category: 'application' });
      }
    });
  });
}

installAutoQueue();
