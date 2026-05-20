/** Reset the user's profile and/or tracker (DANGER ZONE).
 *  RBAC: scope='profile'|'jobs' per-user (ownership-checked → 403); scope='everything'
 *  wipes install-wide shared infra (autopilot.json, activity.jsonl, story-bank.md,
 *  onboarding-state.json, apply-counter.json) -- OWNER-ONLY since a member would
 *  wipe other users' data.
 *  Body: { confirm:'RESET', scope?, profileId? }.
 *  Every modified file is backed up to <path>.bak. Never touches .env, .venv,
 *  or source code. */

import fs from 'node:fs';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { resetProfile, type ResetScope } from '$lib/server/profile';
import { getActiveProfile, getProfileBySlug } from '$lib/server/profiles-db';
import { requireUserId, requireOwner } from '$lib/server/auth-helpers';
import { DATA_ROOT, ROOT } from '$lib/server/files';
import { logEvent } from '$lib/server/events';

const VALID_SCOPES = new Set<ResetScope>(['profile', 'jobs', 'everything']);

const ONBOARDING_STATE = path.join(DATA_ROOT, 'onboarding-state.json');

export const POST = wrap(
  'profile-reset',
  async ({ request, url, locals }: { request: Request; url: URL; locals: App.Locals }) => {
    const userId = requireUserId(locals);
    const body = (await request.json().catch(() => null)) as {
      confirm?: string;
      scope?: string;
      profileId?: string;
      resetOnboarding?: boolean;
    } | null;
    if (!body || body.confirm !== 'RESET') {
      badRequest(
        'Profile reset requires { confirm: "RESET" } in the body — type the word RESET in the dialog to enable the button.',
      );
    }
    const requested = body.scope as ResetScope | undefined;
    const scope: ResetScope = requested && VALID_SCOPES.has(requested) ? requested : 'profile';

    // `everything` wipes shared infra -- strictly owner-only.
    if (scope === 'everything') {
      requireOwner(locals);
    }

    // Resolve the target profile + verify it belongs to the acting user.
    const queryProfile = url.searchParams.get('profile') ?? undefined;
    const explicit = body.profileId || queryProfile;
    let profileSlug: string;
    if (explicit && getProfileBySlug(userId, explicit)) {
      profileSlug = explicit;
    } else if (!explicit) {
      profileSlug = getActiveProfile(userId)?.slug ?? 'default';
    } else {
      // Explicit slug was given but doesn't exist under this user. Either it
      // belongs to someone else or it's stale -- either way refuse rather
      // than silently retargeting their default.
      throw error(403, `Profile "${explicit}" does not belong to you`);
    }

    const result = resetProfile(profileSlug, scope);

    // Optional onboarding-state reset. The dialog exposes a checkbox; the
    // 'everything' scope force-on it (owner gate already passed). State
    // file is shared infrastructure.
    const resetOnboarding = body.resetOnboarding === true || scope === 'everything';
    if (resetOnboarding && fs.existsSync(ONBOARDING_STATE)) {
      // Onboarding reset is shared-state -- owner-only.
      requireOwner(locals);
      try {
        fs.copyFileSync(ONBOARDING_STATE, ONBOARDING_STATE + '.bak');
        result.backups.push(ONBOARDING_STATE + '.bak');
      } catch {
        /* non-fatal */
      }
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
      everything:
        'Pipeline, applications, reports, projects, autopilot, activity feed, and story bank all wiped (with .bak siblings).',
    };

    logEvent('profile-reset', titles[scope] + ' · ' + profileSlug, {
      level: 'warn',
      category: 'user',
      message:
        'profile=' +
        profileSlug +
        ' · ' +
        result.resetFiles.length +
        ' file(s) reset · ' +
        result.backups.length +
        ' backup(s) at .bak. ' +
        summaries[scope],
    });
    return result;
  },
);
