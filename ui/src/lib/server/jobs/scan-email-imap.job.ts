/** Gmail IMAP poller -- wraps scan-email-imap.mjs. Runs every 30 min
 *  via a setInterval daemon (installImapPollerDaemon, kicked off at
 *  boot) that checks the gmail-imap source state per tick and only
 *  spawns when connected; disconnected installs pay zero cost.
 *  setInterval rather than an autopilot Schedule entry because the
 *  scheduler is daily-tick-based; 30-min mail polling doesn't fit
 *  cleanly and is cheap to model directly.
 *  Args: { dryRun } (no writes, no Seen-marking),
 *  { keepUnread } (process without marking Seen, for testing). */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent, reportServerError } from '../events';
import { register, runById, has as hasJob } from './registry';
import { recordSuccess, recordFailure, getSource } from '../sources';
import type { JobArgs, JobResult } from './types';
import { listSchedulableUsers, runAsUser, SYSTEM_USER_ID, userContextEnv } from '../user-context';

const FOUND_RE = /Total jobs found:\s+(\d+)/i;
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 min

function runScanEmailImap(args?: JobArgs): Promise<JobResult> {
  return new Promise((resolve) => {
    const state = getSource('gmail-imap');
    if (!state.connected) {
      resolve({
        ok: false,
        error: 'Gmail IMAP not connected — Connect from /sources to enable this scanner',
      });
      return;
    }

    const cliArgs = ['scripts/scan/scan-email-imap.mjs'];
    if (typeof args?.profileId === 'string' && args.profileId.trim()) {
      cliArgs.push('--profile', args.profileId.trim());
    }
    if (args?.dryRun === true) {
      cliArgs.push('--dry-run');
    }
    if (args?.keepUnread === true) {
      cliArgs.push('--keep-unread');
    }

    let stdout = '';
    let stderr = '';
    logEvent('scan-email-imap', 'Gmail poll started', {
      level: 'info',
      category: 'task',
      message: cliArgs.slice(1).join(' ') || 'unread-since-14d',
    });

    const p = spawn('node', cliArgs, { cwd: ROOT, env: userContextEnv() });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => {
      recordFailure('gmail-imap', err);
      logEvent('scan-email-imap', 'Failed to spawn scan-email-imap.mjs', {
        level: 'error',
        category: 'task',
        message: err.message,
      });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', async (code) => {
      const found = parseInt(stdout.match(FOUND_RE)?.[1] ?? '0', 10);
      if (code !== 0) {
        const tail = (stderr || stdout).slice(-300).trim();
        recordFailure('gmail-imap', new Error(tail || `exit ${code}`));
        logEvent('scan-email-imap', 'Gmail poll failed', {
          level: 'error',
          category: 'task',
          message: `exit ${code}${tail ? ' · ' + tail : ''}`,
        });
        resolve({ ok: false, error: `exit ${code}` });
        return;
      }

      // F14/F19/F30 -- process inbound reactions IN-PROCESS, not via
      // an HTTP roundtrip that would drop the ALS user context. The
      // .mjs child emits `INBOUND_REACTION: {json}` lines on stdout;
      // we parse them here and call reactToEmail() directly. POSTing
      // to /api/email/react would 401 (no cookie) OR process under the
      // wrong user; in-process keeps reactor side-effects (markStatus,
      // generateTechPrep, appendLead) under the CURRENT user context
      // (set by the daemon via runAsUser).
      let reactedActed = 0;
      let reactedTotal = 0;
      try {
        const { reactToEmail } = await import('../email-reactor');
        for (const line of stdout.split('\n')) {
          if (!line.startsWith('INBOUND_REACTION: ')) {
            continue;
          }
          reactedTotal++;
          try {
            const payload = JSON.parse(line.slice('INBOUND_REACTION: '.length));
            const result = await reactToEmail(payload);
            if (result?.classification?.kind && result.classification.kind !== 'other') {
              reactedActed++;
            }
          } catch (err) {
            reportServerError('scan-email-imap', 'reactToEmail crashed on a line', err, {
              category: 'task',
            });
          }
        }
      } catch (err) {
        reportServerError('scan-email-imap', 'Failed to load email-reactor', err, {
          category: 'task',
        });
      }

      recordSuccess('gmail-imap');
      const reactedSuffix = reactedTotal ? ` · reactor: ${reactedActed}/${reactedTotal} acted` : '';
      logEvent('scan-email-imap', `Gmail poll finished · ${found} new${reactedSuffix}`, {
        level: 'success',
        category: 'task',
        message: 'IMAP session healthy',
      });
      resolve({
        ok: true,
        message: `${found} new offers${reactedSuffix}`,
        meta: { found, reactedActed, reactedTotal },
      });
    });
  });
}

register({
  id: 'scan-email-imap',
  label: 'Gmail IMAP poll',
  description:
    'Polls Gmail every 30 min for LinkedIn / Indeed / digest job-alert emails. Marks processed messages as Seen.',
  category: 'discovery',
  trigger: { type: 'manual' }, // scheduling handled by the daemon below
  allowManual: true,
  perUser: true,
  run: runScanEmailImap,
});

// ── Daemon ─────────────────────────────────────────────────────────────
//
// installImapPollerDaemon() kicks off a 30-min setInterval when the
// jobs/index.ts barrel imports this file. Idempotent -- multiple imports
// (e.g. Vite HMR re-running module init) clear the prior timer first.

let pollerHandle: ReturnType<typeof setInterval> | null = null;

/** F14/F19/F27 -- multi-user gmail-imap fan-out.
 *
 *  Each user holds their own GMAIL_IMAP_* credentials in their
 *  encrypted per-user secrets store (`user-secrets.ts`) and tracks
 *  their own connection state in their own `sources.json`. Every 30
 *  minutes the daemon walks all schedulable users; for each one it
 *  enters their ALS context (`runAsUser`), checks if THEY have
 *  gmail-imap connected, and -- if so -- runs the poll under that user.
 *
 *  Why per-user ALS context matters: the child process inherits
 *  `HERON_USER_ID` from the orchestrator's env injection
 *  (orchestrator.ts::start) which means the .mjs script reads THAT
 *  user's encrypted credentials via `scripts/lib/user-secrets.mjs`,
 *  writes pipeline / applications / scan-history into THAT user's
 *  profile tree, and the in-process `reactToEmail()` calls in this
 *  file's close-handler run inside THAT user's context. No cross-user
 *  contamination possible -- the same primitive that gates every other
 *  fan-out job (autopilot.ts::runScanForAllProfiles etc.) gates this
 *  one too.
 *
 *  Errors per user are isolated: a malformed credential on user A
 *  doesn't stop user B's poll from running. */
export async function tickOnce(): Promise<void> {
  if (!hasJob('scan-email-imap')) {
    return;
  }
  const userIds = await listSchedulableUsers();
  // Filter out SYSTEM_USER_ID -- legacy single-user installs that
  // haven't yet completed onboarding have nothing real to poll, and
  // SYSTEM's sources.json is the install-wide fallback we don't want
  // running automatically.
  const realUsers = userIds.filter((u) => u !== SYSTEM_USER_ID);
  if (realUsers.length === 0) {
    return;
  }

  // Run polls SEQUENTIALLY rather than in parallel: each poll spawns
  // a child process that consumes network + IMAP-connection slots, and
  // a busy install with five users would otherwise stampede the local
  // resolver / our own ImapFlow socket pool. Serial fan-out keeps load
  // predictable and lets `await runAsUser` clear context cleanly
  // between users.
  for (const userId of realUsers) {
    await runAsUser(userId, async () => {
      try {
        if (!getSource('gmail-imap').connected) {
          return;
        }
        await runById('scan-email-imap');
      } catch (err) {
        // Per-user error -- log + continue to the next user. NEVER let a
        // single bad credential or transient IMAP failure halt the
        // whole fan-out.
        reportServerError('scan-email-imap', `Daemon poll rejected for user ${userId}`, err, {
          category: 'task',
          userId,
        });
      }
    });
  }
}

export function installImapPollerDaemon(): void {
  // Belt-and-braces idempotence: clear any prior handle on re-install.
  if (pollerHandle) {
    try {
      clearInterval(pollerHandle);
    } catch {
      // Already cleared or handle no longer valid -- no-op on idempotent reinstall.
    }
    pollerHandle = null;
  }
  const fire = (): void => {
    void tickOnce().catch((err) => {
      reportServerError('scan-email-imap', 'Daemon tick failed', err, { category: 'task' });
    });
  };
  // Run a first poll 60s after boot (don't block boot itself), then
  // every 30 min thereafter. Both timers MUST be unref'd: in `vitest`
  // worker processes, an alive timer at module-import time keeps the
  // event loop running past `afterAll` -- vitest then prints "close
  // timed out after 10000ms" because the worker can't exit cleanly.
  // The `installImapPollerDaemon()` call at the bottom of this file
  // auto-runs on first import, so any test that touches the registry
  // barrel triggers this code path.
  const initialFire = setTimeout(fire, 60_000);
  initialFire.unref?.();
  pollerHandle = setInterval(fire, POLL_INTERVAL_MS);
  pollerHandle.unref?.();
}

// Auto-install when the module is first imported (jobs/index.ts barrel).
installImapPollerDaemon();

// D24 -- `runScanEmailImap` was only used by the registry; export removed.
