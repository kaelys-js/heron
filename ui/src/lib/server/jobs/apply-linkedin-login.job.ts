/**
 * apply-linkedin-login — opens LinkedIn in a Playwright browser so the user
 * can sign in. Saves the authenticated session at `.playwright-linkedin/`
 * for subsequent scan-linkedin-auth + linkedin-easy-apply runs.
 *
 * Previously this was only handled by the legacy `/api/run` switch with
 * task id `apply-linkedin-login` — invisible to the registry, the Agents
 * page, and any post-Phase-1 surface. Registering here makes it show up
 * with every other manual job (D25).
 */
import { register } from './registry';
import { logEvent } from '../events';

register({
  id: 'apply-linkedin-login',
  label: 'LinkedIn login',
  description:
    'Opens LinkedIn in a Playwright browser window so you can sign in. The session is saved at .playwright-linkedin/ and reused for scans + Easy Apply.',
  category: 'apply',
  trigger: { type: 'manual' },
  allowManual: true,
  run: async () => {
    try {
      const { runLinkedInLogin } = await import('../orchestrator');
      runLinkedInLogin();
      logEvent('apply-linkedin-login', 'LinkedIn login window opened', {
        level: 'info',
        category: 'task',
        message: 'Sign in to LinkedIn in the Playwright browser; session saves automatically.',
      });
      return {
        ok: true,
        message: 'LinkedIn login window opened — sign in in the Playwright browser.',
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});
