/**
 * Nuclear reset of the user's profile — and optionally the entire job-search
 * tracker — back to first-run state.
 *
 * Body: { confirm: 'RESET'; scope?: 'profile' | 'everything' }
 *   scope='profile'    (default) — wipes profile.yml + cv.md + modes/_profile.md
 *   scope='everything'           — additionally wipes pipeline / applications /
 *                                   reports / output / projects / scan history
 *
 * Both modes back up every modified file to `<path>.bak` before overwriting
 * so the user can recover by hand. The endpoint NEVER touches the user's
 * .env (API keys), .venv (Python deps), or source code.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resetProfile, type ResetScope } from '$lib/server/profile';
import { logEvent } from '$lib/server/events';

export const POST = wrap('profile-reset', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { confirm?: string; scope?: string } | null;
  if (!body || body.confirm !== 'RESET') {
    badRequest('Profile reset requires { confirm: "RESET" } in the body — type the word RESET in the dialog to enable the button.');
  }
  const scope: ResetScope = body.scope === 'everything' ? 'everything' : 'profile';
  const result = resetProfile(scope);
  logEvent(
    'profile-reset',
    scope === 'everything'
      ? 'Profile + tracker reset to first-run state'
      : 'Profile reset to first-run state',
    {
      level: 'warn',
      category: 'user',
      message:
        result.resetFiles.length + ' file(s) reset · ' +
        result.backups.length + ' backup(s) at .bak. ' +
        (scope === 'everything'
          ? 'Pipeline, applications, reports, projects, and activity feed are gone.'
          : 'Tracker, reports, and projects were preserved.'),
    },
  );
  return result;
});
