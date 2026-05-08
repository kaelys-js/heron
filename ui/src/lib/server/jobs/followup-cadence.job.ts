/**
 * Follow-up cadence — daily snapshot.
 *
 * Refreshes the cached follow-up cadence (data/followup-cache.json) once a
 * day. The cache is also lazily refreshed on /api/followup/cadence reads
 * when ≥5 minutes stale; this job just guarantees a daily warm cache so
 * the Inbox + /applied land instantly.
 *
 * Activity feed: emits a single info event listing how many entries are
 * urgent / overdue. Silent when nothing is actionable.
 */

import { logEvent, reportServerError } from '../events';
import { getFollowupCadence } from '../followup-cadence';
import { register } from './registry';
import type { JobResult } from './types';

async function runFollowupCadence(): Promise<JobResult> {
  try {
    const cadence = await getFollowupCadence({ force: true });
    const meta = cadence.metadata;
    const total = meta.urgent + meta.overdue;
    if (total > 0) {
      logEvent(
        'followup-cadence',
        'Follow-ups due: ' + meta.urgent + ' urgent · ' + meta.overdue + ' overdue',
        {
          level: 'info',
          category: 'application',
          message: meta.actionable + ' actionable applications · see /applied',
        },
      );
    }
    return {
      ok: true,
      message: 'Refreshed cadence · ' + meta.actionable + ' actionable',
      meta: { ...meta },
    };
  } catch (err) {
    reportServerError('followup-cadence', 'Cadence refresh failed', err, { category: 'application' });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

register({
  id: 'followup-cadence',
  label: 'Follow-up cadence',
  description: 'Daily snapshot of which active applications need a nudge.',
  category: 'insight',
  trigger: { type: 'daily', hour: 9, minute: 0, weekdays: [1, 2, 3, 4, 5] },
  allowManual: true,
  run: runFollowupCadence,
});
