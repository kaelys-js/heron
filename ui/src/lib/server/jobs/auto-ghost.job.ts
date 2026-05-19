/**
 * Auto-ghost sweep -- flags applications silent for ≥ DAYS_TO_GHOST days.
 *
 * Why a sweep (not on-write): `lastTouchAt` is updated whenever a stage
 * transition happens. Detecting "silence" is the absence of an event,
 * which can't be detected on-write. A daily sweep is the right shape.
 *
 * For each silent job:
 *   1. `markGhosted` appends a Ghosted transition + sets ghostedAt
 *      (which is a no-op if the user has manually transitioned to one of
 *      the terminal states since)
 *   2. An Issue is filed with `dedupeKey = 'ghost:' + jobId` so the
 *      same application can't accumulate duplicate cards over multiple
 *      sweeps.
 *
 * Trigger: daily 09:00 (weekdays). Manual run is allowed.
 */

import { register } from './registry';
import type { JobResult } from './types';
import { listStaleJobs, markGhosted, listAllStageState } from '../stage-state';
import { listProfilesForUser } from '../profiles-db';
import { reportIssue } from '../issues';
import { logEvent } from '../events';
import { currentUserIdOrDefault, SYSTEM_USER_ID } from '../user-context';

const DAYS_TO_GHOST = 21;

function runOneProfile(profileId: string): { ghosted: number } {
  let ghosted = 0;
  const stale = listStaleJobs(DAYS_TO_GHOST, profileId);
  const allState = listAllStageState(profileId);
  for (const { jobId, daysSinceLastTouch } of stale) {
    const state = allState[jobId];
    // Already ghosted in a previous sweep -- leave alone.
    if (state?.ghostedAt) continue;
    markGhosted(jobId, profileId);
    ghosted++;
    reportIssue({
      severity: 'info',
      source: 'auto-ghost',
      summary: 'Silent ' + daysSinceLastTouch + 'd · ' + jobId,
      detail:
        'No transition or touch in ' +
        daysSinceLastTouch +
        ' days. Mark as Ghosted automatically OR send one final follow-up.',
      fix: { label: 'Open job', href: '/job/' + jobId + '#followup' },
      dedupeKey: 'ghost:' + jobId,
    });
  }
  return { ghosted };
}

async function runAutoGhost(): Promise<JobResult> {
  // F26 -- single fan-out only. Pre-fix runAutoGhost manually iterated
  // listSchedulableUsers() AND was registered with perUser:true, so the
  // registry's runById fan-out invoked this N times and each invocation
  // looped over N users → N² work + N²× redundant logs. Now: declare
  // perUser:true and trust the registry to fan out, operate on the
  // current user only inside this function.
  let totalGhosted = 0;
  let profilesScanned = 0;
  const userId = currentUserIdOrDefault();
  const profiles =
    userId === SYSTEM_USER_ID
      ? [{ slug: 'default' } as { slug: string }]
      : listProfilesForUser(userId);
  for (const p of profiles) {
    profilesScanned++;
    totalGhosted += runOneProfile(p.slug).ghosted;
  }
  const msg =
    'Auto-ghost sweep · ' +
    totalGhosted +
    ' flagged across ' +
    profilesScanned +
    ' profiles · threshold ' +
    DAYS_TO_GHOST +
    'd';
  logEvent('auto-ghost', msg, {
    level: totalGhosted ? 'warn' : 'info',
    category: 'system',
    message: msg,
  });
  return {
    ok: true,
    message: msg,
    meta: { ghosted: totalGhosted, profiles: profilesScanned, threshold: DAYS_TO_GHOST },
  };
}

register({
  id: 'auto-ghost',
  label: 'Auto-ghost detector',
  description:
    'Daily sweep — flags applications silent ≥ ' +
    DAYS_TO_GHOST +
    ' days as Ghosted + files an Inbox card for each.',
  category: 'hygiene',
  trigger: { type: 'daily', hour: 9, minute: 0, weekdays: [1, 2, 3, 4, 5] },
  allowManual: true,
  perUser: true,
  run: runAutoGhost,
});
