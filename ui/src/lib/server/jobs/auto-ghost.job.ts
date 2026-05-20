/** Auto-ghost sweep -- flags applications silent for ≥ DAYS_TO_GHOST
 *  days (21). Silence is the absence of a stage transition; can't be
 *  detected on-write, hence a daily sweep.
 *  Per silent job: markGhosted() appends a Ghosted transition + sets
 *  ghostedAt (no-op if the user already moved to a terminal state).
 *  Issue filed with dedupeKey='ghost:'+jobId so repeated sweeps don't
 *  duplicate cards.
 *  Trigger: weekdays 09:00. Manual run allowed. */

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
  // F26 -- single fan-out only. Declared `perUser:true`, so the registry
  // fans out across users; this function MUST operate on the current
  // user only. Manually iterating listSchedulableUsers() inside while
  // also being perUser:true would invoke this N times each looping over
  // N users → N² work + N² redundant logs.
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
