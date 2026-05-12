/**
 * lifecycle-reap — daily cron that hard-deletes users whose 30-day
 * soft-delete grace window has elapsed. Idempotent; no-ops if no users
 * are due.
 *
 * Trigger: daily at 04:00 (off-peak, so a large purge doesn't compete
 * with morning scan jobs). Manual run is allowed for tests.
 */

import { reapExpiredDeletions } from '../account-lifecycle';
import { recordAuditEvent } from '../audit-log';
import { logEvent } from '../events';
import { pruneExpired as pruneExpiredInvites } from '../invite-codes';
import { register } from './registry';
import type { JobResult } from './types';

async function runLifecycleReap(): Promise<JobResult> {
  const purgedUsers = reapExpiredDeletions();
  const purgedInvites = pruneExpiredInvites();
  for (const userId of purgedUsers) {
    recordAuditEvent('account-purged', { userId });
  }
  if (purgedUsers.length > 0 || purgedInvites > 0) {
    logEvent('lifecycle-reap', `Reaped ${purgedUsers.length} user(s), ${purgedInvites} invite(s)`, {
      level: 'info',
      category: 'system',
      // Broadcast — every authed user can see this in the activity feed,
      // because the affected user is gone and there's no per-user scope.
      userId: null,
    });
  }
  return {
    ok: true,
    message: `Purged ${purgedUsers.length} users, ${purgedInvites} expired invites`,
    meta: { purgedUsers, purgedInvites },
  };
}

register({
  id: 'lifecycle-reap',
  label: 'Account lifecycle reaper',
  description:
    'Hard-deletes users whose 30-day grace window has expired, and prunes expired invite codes.',
  category: 'hygiene',
  trigger: { type: 'daily', hour: 4, minute: 0 },
  allowManual: true,
  run: runLifecycleReap,
});
