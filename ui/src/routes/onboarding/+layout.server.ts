/**
 * Onboarding layout loader.
 *
 * Four responsibilities (after multi-user landed):
 *
 *   0. **Auth gate** -- if no user accounts exist in auth.db, divert to
 *      /onboarding/account (the "create your owner account" step). If a
 *      user exists but isn't signed in for this request, divert to /login
 *      so they can authenticate before continuing setup. Already-authed
 *      users proceed through the rest of the wizard normally.
 *
 *   1. Seeds the active profile's `_profile.md` from the bundled template
 *      the first time the wizard loads. Per-profile copy now; previously
 *      shared at `modes/_profile.md`.
 *
 *   2. Resolves the wizard's TARGET profile:
 *      - `?profile=<slug>` → use that profile
 *      - `?new=1` (no slug yet) → flag that the Welcome step needs to
 *        prompt for a new profile name + color, then create + redirect
 *      - default → active profile
 *
 *   3. Loads onboarding state for the sidebar progress indicator.
 */

import fs from 'node:fs';
import path from 'node:path';
import { redirect } from '@sveltejs/kit';
import { readOnboarding, progressSummary } from '$lib/server/onboarding';
import { ROOT } from '$lib/server/files';
import { profilePath, ensureProfileDirs } from '$lib/server/profile-paths';
import { getActiveProfileId, getProfile, listProfiles } from '$lib/server/profiles';
import { authDb } from '$lib/server/db';
import { users } from '$lib/server/db/auth-schema';
import { sql } from 'drizzle-orm';

const PROFILE_TEMPLATE = path.join(ROOT, 'modes', '_profile.template.md');

function seedProfileMd(profileId: string): void {
  const target = profilePath(profileId, 'profile-md');
  if (fs.existsSync(target)) return;
  if (!fs.existsSync(PROFILE_TEMPLATE)) return;
  try {
    ensureProfileDirs(profileId);
    fs.copyFileSync(PROFILE_TEMPLATE, target);
  } catch {
    // Non-fatal -- wizard still works without _profile.md.
  }
}

export async function load({ url, locals }: { url: URL; locals: App.Locals }) {
  // Auth gate (responsibility #0). The /onboarding/account step is the
  // ONLY public onboarding page when no users exist yet; everything else
  // requires a signed-in session because per-user data needs a user_id.
  if (!url.pathname.startsWith('/onboarding/account')) {
    const [{ n }] = authDb.select({ n: sql<number>`count(*)` }).from(users).all();
    if (n === 0) {
      throw redirect(302, '/onboarding/account');
    }
    if (!locals.user) {
      throw redirect(302, '/login?redirectTo=' + encodeURIComponent(url.pathname + url.search));
    }
  }

  const queryProfile = url.searchParams.get('profile');
  const isNewProfile = url.searchParams.get('new') === '1';

  // Resolve the wizard's target profile:
  //   - explicit ?profile=<slug> AND exists → use it
  //   - ?new=1 AND no slug yet → leave undefined; Welcome step prompts
  //     for name + color, then creates the profile and redirects with
  //     ?profile=<new-slug>
  //   - default → active profile
  let targetProfileId: string | undefined;
  if (queryProfile && getProfile(queryProfile)) {
    targetProfileId = queryProfile;
  } else if (!isNewProfile) {
    targetProfileId = getActiveProfileId();
  }

  if (targetProfileId) seedProfileMd(targetProfileId);

  const state = readOnboarding();
  const progress = progressSummary().map((p) =>
    // If a user is signed in, the 'account' step is implicitly done --
    // they had to authenticate to reach the rest of the wizard.
    p.step === 'account' && locals.user ? { ...p, status: 'complete' as const } : p,
  );
  return {
    state,
    progress,
    profileId: targetProfileId,
    isNewProfile,
    profiles: listProfiles(),
  };
}

// Tell SvelteKit to NOT inherit parent layout data -- we don't need
// inboxCount / queueCount / pinnedJobs in the wizard.
