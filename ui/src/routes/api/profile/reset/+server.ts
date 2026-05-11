/**
 * Reset of the user's profile and/or the job-search tracker.
 *
 * Body: { confirm: 'RESET'; scope?: 'profile' | 'jobs' | 'everything' }
 *   scope='profile'    (default) — wipes profile.yml + cv.md + modes/_profile.md
 *                                   for the target profile only. Tracker /
 *                                   pipeline / sources / reports / shared
 *                                   infra PRESERVED.
 *   scope='jobs'                 — wipes the target profile's job-search
 *                                   artifacts (applications, pipeline, scan
 *                                   history, gemini scores, reports, output
 *                                   PDFs, follow-ups, interview-prep company
 *                                   files). Profile + CV + targeting + shared
 *                                   infra PRESERVED.
 *   scope='everything'           — strict superset: everything in 'profile'
 *                                   AND 'jobs', plus this profile's
 *                                   projects.json AND shared infrastructure
 *                                   (autopilot.json reset to defaults,
 *                                   activity.jsonl truncated, job-last-run.json
 *                                   deleted, apply-counter.json deleted,
 *                                   interview-prep/story-bank.md deleted).
 *
 * All modes back up every modified file to `<path>.bak` before overwriting
 * so the user can recover by hand. The endpoint NEVER touches the user's
 * .env (API keys), .venv (Python deps), or source code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { resetProfile, type ResetScope } from '$lib/server/profile';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { ROOT } from '$lib/server/files';
import { logEvent } from '$lib/server/events';

const VALID_SCOPES = new Set<ResetScope>(['profile', 'jobs', 'everything']);

const ONBOARDING_STATE = path.join(ROOT, 'data', 'onboarding-state.json');

export const POST = wrap('profile-reset', async ({ request, url }: { request: Request; url: URL }) => {
  const body = (await request.json().catch(() => null)) as {
    confirm?: string;
    scope?: string;
    profileId?: string;
    resetOnboarding?: boolean;
  } | null;
  if (!body || body.confirm !== 'RESET') {
    badRequest('Profile reset requires { confirm: "RESET" } in the body — type the word RESET in the dialog to enable the button.');
  }
  const requested = body.scope as ResetScope | undefined;
  const scope: ResetScope = requested && VALID_SCOPES.has(requested) ? requested : 'profile';

  // SAFETY: the body or URL can name an explicit target profile. If the user
  // is viewing /profile?profile=B and clicks reset, this MUST wipe B not the
  // currently-active profile A. Body field wins over query so the
  // ResetProfileDialog (which already knows the profile from data) can pass
  // it through unambiguously.
  const queryProfile = url.searchParams.get('profile') ?? undefined;
  const explicit = body.profileId || queryProfile;
  const profileId = (explicit && getProfile(explicit)) ? explicit : getActiveProfileId();

  const result = resetProfile(profileId, scope);

  // Optional onboarding-state reset. The dialog exposes a checkbox; the
  // 'everything' scope force-on it. State file is shared infrastructure, so
  // it's backed up to .bak before deletion.
  const resetOnboarding = body.resetOnboarding === true || scope === 'everything';
  if (resetOnboarding && fs.existsSync(ONBOARDING_STATE)) {
    try {
      fs.copyFileSync(ONBOARDING_STATE, ONBOARDING_STATE + '.bak');
      result.backups.push(ONBOARDING_STATE + '.bak');
    } catch { /* non-fatal */ }
    try {
      fs.unlinkSync(ONBOARDING_STATE);
      result.resetFiles.push(path.relative(ROOT, ONBOARDING_STATE));
    } catch (e) {
      logEvent('profile-reset', 'Could not delete onboarding-state.json', {
        level: 'warn',
        category: 'application',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const titles: Record<ResetScope, string> = {
    profile: 'Profile reset to first-run state',
    jobs: 'Jobs data wiped',
    everything: 'Profile + tracker reset to first-run state',
  };
  const summaries: Record<ResetScope, string> = {
    profile: 'Tracker, reports, and projects were preserved.',
    jobs: 'Profile, CV, targeting, and connected sources were preserved.',
    everything: 'Pipeline, applications, reports, projects, autopilot, activity feed, and story bank all wiped (with .bak siblings).',
  };

  logEvent('profile-reset', titles[scope] + ' · ' + profileId, {
    level: 'warn',
    category: 'user',
    message:
      'profile=' + profileId + ' · ' +
      result.resetFiles.length + ' file(s) reset · ' +
      result.backups.length + ' backup(s) at .bak. ' +
      summaries[scope],
  });
  return result;
});
