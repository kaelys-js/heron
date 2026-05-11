/**
 * Job registry barrel — importing this module triggers registration of
 * every known job. Called from `bootOnce()` in orchestrator.ts.
 *
 * Order matters only for visibility (the registry is a Map keyed by id, so
 * later registrations of the same id overwrite earlier ones). Legacy tasks
 * are wired here directly to avoid circular imports between orchestrator
 * and registry.
 *
 * Phase 1+ tasks (normalize, dedup, liveness, etc.) will live in their
 * own `*.job.ts` files imported below as we build them.
 */

import { register, installAfterListener } from './registry';
import { runScan, runGemini, runLinkedInApply } from '../orchestrator';
import { startBatchWatcher } from './auto-merge-batch';
import { migrateToMultiProfile } from '../profile-migrate';

// Phase 1 hygiene jobs — importing each module triggers its register() call.
// These imports MUST stay; tree-shaking would skip them otherwise.
import './normalize.job';
import './dedup.job';
import './verify-pipeline.job';
import './liveness.job';
import './auto-triage.job';

// Phase 2 discovery jobs.
import './scan-portals.job';
import './scan-curated.job';
import './scan-vc.job';
import './scan-email.job';
import './scan-email-imap.job';
import './scan-linkedin-auth.job';
import './scan-indeed-auth.job';
import './scan-all.job';

// Phase 3 insight jobs.
import './followup-cadence.job';
import './auto-interview-prep';

// Phase 4 auto-apply pipeline jobs.
import './auto-queue';
import './daily-digest.job';
import './apply-linkedin-login.job';
import './compile-latex.job';
import '../autopilot-circuit-breaker';

// Phase 5 autonomous-apply system.
import './apply-queue.job';

// Phase 6 maintenance jobs.
import './backup.job';

let installed = false;

export function installAllJobs(): void {
  if (installed) return;
  installed = true;

  // FIRST: migrate legacy single-profile layout into data/profiles/default/.
  // Idempotent — once profiles.json exists and no legacy files remain at
  // their flat-layout paths, this is a cheap early-return.
  try {
    migrateToMultiProfile();
  } catch (e) {
    // P16: surface the failure in the activity feed (not just stdout) so
    // a user who only sees the dashboard knows their data wasn't migrated.
    // Don't let a migration error kill boot — fall through to default state.
    // Use a dynamic import to avoid a circular dependency with the bus.
    import('../events').then(({ reportServerError }) => {
      reportServerError('migrate', 'Multi-profile migration failed', e, {
        category: 'system',
      });
    }).catch(() => {
      console.error('[boot] profile migration failed:', e);
    });
  }

  // Legacy tasks — preserve the exact ids used in /api/run today so
  // existing callers and Autopilot config keep working unchanged.
  register({
    id: 'scan',
    label: 'Portal scanner (broad)',
    description: 'JobSpy + multi-source scrape (LinkedIn / Indeed / Greenhouse / Ashby / Lever / The Muse / HN / RemoteOK / WWR).',
    category: 'discovery',
    trigger: { type: 'manual' },
    allowManual: true,
    run: () => {
      runScan();
      return { ok: true, message: 'Scan started — watch the activity feed' };
    },
  });

  register({
    id: 'gemini',
    label: 'Gemini first-pass scoring',
    description: 'Title + company filter via Gemini Flash. Cheap first-pass over every pending job.',
    category: 'evaluation',
    trigger: { type: 'manual' },
    allowManual: true,
    run: (args) => {
      const top = typeof args?.top === 'number' ? args.top : 30;
      runGemini(top);
      return { ok: true, message: 'Gemini scoring started · top=' + top };
    },
  });

  register({
    id: 'apply-linkedin',
    label: 'LinkedIn Easy Apply',
    description: 'Auto-fills LinkedIn applications via Playwright. Stops at Submit unless LINKEDIN_AUTO_SUBMIT=1.',
    category: 'apply',
    trigger: { type: 'manual' },
    allowManual: true,
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
