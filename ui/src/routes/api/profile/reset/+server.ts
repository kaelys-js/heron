/**
 * Reset of the user's profile and/or the job-search tracker.
 *
 * Body: { confirm: 'RESET'; scope?: 'profile' | 'jobs' | 'everything' }
 *   scope='profile'    (default) — wipes profile.yml + cv.md + modes/_profile.md
 *   scope='jobs'                 — wipes job-search artifacts (applications,
 *                                   pipeline, scan history, gemini scores,
 *                                   reports, output PDFs, follow-ups,
 *                                   interview-prep company files, issues,
 *                                   activity feed). Profile + CV + targeting
 *                                   + sources are PRESERVED.
 *   scope='everything'           — strict superset: everything in 'profile'
 *                                   AND 'jobs', plus longer-lived configs
 *                                   (projects.json filter profiles,
 *                                   autopilot.json schedule, the story bank).
 *
 * All modes back up every modified file to `<path>.bak` before overwriting
 * so the user can recover by hand. The endpoint NEVER touches the user's
 * .env (API keys), .venv (Python deps), or source code.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resetProfile, type ResetScope } from '$lib/server/profile';
import { logEvent } from '$lib/server/events';

const VALID_SCOPES = new Set<ResetScope>(['profile', 'jobs', 'everything']);

export const POST = wrap('profile-reset', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { confirm?: string; scope?: string } | null;
  if (!body || body.confirm !== 'RESET') {
    badRequest('Profile reset requires { confirm: "RESET" } in the body — type the word RESET in the dialog to enable the button.');
  }
  const requested = body.scope as ResetScope | undefined;
  const scope: ResetScope = requested && VALID_SCOPES.has(requested) ? requested : 'profile';
  const result = resetProfile(scope);

  const titles: Record<ResetScope, string> = {
    profile: 'Profile reset to first-run state',
    jobs: 'Jobs data wiped',
    everything: 'Profile + tracker reset to first-run state',
  };
  const summaries: Record<ResetScope, string> = {
    profile: 'Tracker, reports, and projects were preserved.',
    jobs: 'Profile, CV, targeting, and connected sources were preserved.',
    everything: 'Pipeline, applications, reports, projects, and activity feed are gone.',
  };

  logEvent('profile-reset', titles[scope], {
    level: 'warn',
    category: 'user',
    message:
      result.resetFiles.length + ' file(s) reset · ' +
      result.backups.length + ' backup(s) at .bak. ' +
      summaries[scope],
  });
  return result;
});
