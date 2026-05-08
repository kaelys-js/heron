/**
 * Auto-flip Ready → Queued after CV generation finishes.
 *
 * runOferta() emits a 'Generate CV finished' success event with the URL in
 * the message field once the report + PDF are written to disk. We intercept
 * that, look up the job, and bump its status to Queued so it lands on the
 * /queue page for batch send.
 *
 * Skips:
 *   - Jobs that aren't currently in Ready (preserves manual status flips)
 *   - Jobs that already have status >= Queued (idempotent on re-runs)
 *
 * Status update is fire-and-forget via the existing /api/status helper —
 * normalize.job + dedup.job already chain off that.
 */

import { installBusListener, logEvent, reportServerError } from '../events';
import { loadAllJobs } from '../parsers';
import { markStatus } from '../applications';
import type { ActivityEvent } from '$lib/types';

function installAutoQueue(): void {
  // installBusListener is idempotent across HMR — see events.ts.
  installBusListener('auto-queue', (ev: ActivityEvent) => {
    if (ev.level !== 'success') return;
    if (ev.source !== 'oferta') return;
    if (!/Generate CV finished/i.test(ev.title)) return;

    // Message format set by runOferta: 'Report + tailored CV PDF generated · <url>'
    const m = (ev.message ?? '').match(/\bhttps?:\/\/\S+/);
    if (!m) return;
    const url = m[0].replace(/[)\].,>]+$/, '');

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
}

installAutoQueue();
