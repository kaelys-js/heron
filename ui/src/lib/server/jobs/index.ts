/** Job registry barrel -- importing triggers registration of every
 *  known job. Called from bootOnce() in orchestrator.ts. Each *.job.ts
 *  self-registers on import; the seemingly-unused imports below MUST
 *  stay or tree-shaking drops them and the job never exists at runtime.
 *  Order matters only for visibility (Map keyed by id, last write
 *  wins). Legacy tasks are wired here directly to avoid circular
 *  imports between orchestrator and registry. */

import { register, installAfterListener } from './registry';
import { runScan, runGemini, runLinkedInApply } from '../orchestrator';
import { startBatchWatcher } from './auto-merge-batch';
import { migrateToMultiProfile } from '../profile-migrate';

// Hygiene -- keep applications.md canonical, dedup, validate URLs.
import './normalize.job';
import './dedup.job';
import './verify-pipeline.job';
import './liveness.job';
import './auto-triage.job';

// Discovery -- portal scrapes + curated feeds + email/IMAP intake.
import './scan-portals.job';
import './scan-curated.job';
import './scan-vc.job';
import './scan-email.job';
import './scan-email-imap.job';
import './scan-linkedin-auth.job';
import './scan-indeed-auth.job';
import './scan-all.job';

// Insight -- follow-up cadence calculator + auto-interview-prep.
import './followup-cadence.job';
import './auto-interview-prep';

// Auto-apply pipeline -- queue, digest, LinkedIn warmup, LaTeX render.
import './auto-queue';
import './daily-digest.job';
import './apply-linkedin-login.job';
import './compile-latex.job';
import '../autopilot-circuit-breaker';

// Autonomous-apply system -- drains the queue when conditions hold.
import './apply-queue.job';

// Maintenance -- backups, auto-ghost, LinkedIn audit + DM.
import './backup.job';
import './auto-ghost.job';
import './linkedin-audit.job';
import './linkedin-dm.job';

// Interview-reminder daemon -- ticks every 15 min via setInterval (not
// the daily autopilot) so T-30min and T-24h reminders fire on time.
import './interview-reminder.job';
import { installInterviewReminderDaemon } from './interview-reminder.job';

// Multi-user lifecycle reaper -- daily 04:00. Hard-deletes users past
// their 30-day soft-delete grace window and prunes expired invite codes.
import './lifecycle-reap.job';

let installed = false;

export function installAllJobs(): void {
  if (installed) return;
  installed = true;

  // FIRST: migrate legacy single-profile layout into data/profiles/default/.
  // Idempotent -- once profiles.json exists and no legacy files remain at
  // their flat-layout paths, this is a cheap early-return.
  try {
    migrateToMultiProfile();
  } catch (e) {
    // P16: surface the failure in the activity feed (not just stdout) so
    // a user who only sees the dashboard knows their data wasn't migrated.
    // Don't let a migration error kill boot -- fall through to default state.
    // Use a dynamic import to avoid a circular dependency with the bus.
    import('../events')
      .then(({ reportServerError }) => {
        reportServerError('migrate', 'Multi-profile migration failed', e, {
          category: 'system',
        });
      })
      .catch(() => {
        console.error('[boot] profile migration failed:', e);
      });
  }

  // Legacy tasks -- preserve the exact ids used in /api/run today so
  // existing callers and Autopilot config keep working unchanged.
  register({
    id: 'scan',
    label: 'Portal scanner (broad)',
    description:
      'JobSpy + multi-source scrape (LinkedIn / Indeed / Greenhouse / Ashby / Lever / The Muse / HN / RemoteOK / WWR).',
    category: 'discovery',
    trigger: { type: 'manual' },
    allowManual: true,
    // runScan() reads the active profile's portals.yml / scan-history.tsv
    // and writes the active profile's pipeline.md -- must fan out across
    // every schedulable user. The orchestrator's spawn passes the resolved
    // user/profile via `--user`/`--profile` flags.
    perUser: true,
    run: () => {
      runScan();
      return { ok: true, message: 'Scan started — watch the activity feed' };
    },
  });

  register({
    id: 'gemini',
    label: 'Gemini first-pass scoring',
    description:
      'Title + company filter via Gemini Flash. Cheap first-pass over every pending job.',
    category: 'evaluation',
    trigger: { type: 'manual' },
    allowManual: true,
    // runGemini() scores entries in the active profile's pipeline.md.
    perUser: true,
    run: (args) => {
      const top = typeof args?.top === 'number' ? args.top : 30;
      runGemini(top);
      return { ok: true, message: 'Gemini scoring started · top=' + top };
    },
  });

  register({
    id: 'apply-linkedin',
    label: 'LinkedIn Easy Apply',
    description:
      'Auto-fills LinkedIn applications via Playwright. Stops at Submit unless LINKEDIN_AUTO_SUBMIT=1.',
    category: 'apply',
    trigger: { type: 'manual' },
    allowManual: true,
    // LinkedIn Easy Apply runs against the active profile's cv.md +
    // applications.md row; the persistent Playwright session is also
    // per-user (see lib_playwright_auth.py).
    perUser: true,
    run: (args) => {
      const autoSubmit = !!args?.autoSubmit;
      const url = typeof args?.url === 'string' ? args.url : undefined;
      runLinkedInApply(autoSubmit, url);
      return { ok: true, message: 'LinkedIn Easy Apply started' };
    },
  });

  // Subscribe to bus events so `after`-trigger jobs fire automatically.
  installAfterListener();

  // Start the fs watcher for batch tracker additions. Idempotent.
  startBatchWatcher();

  // Interview-reminder daemon -- ticks every 15 min to fire T-30min
  // and T-24h reminders for scheduled interviews.
  installInterviewReminderDaemon();
}

export * from './types';
export {
  register,
  get,
  has,
  list,
  listSummaries,
  runById,
  isRunning,
  installAfterListener,
} from './registry';
