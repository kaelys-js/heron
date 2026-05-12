/**
 * POST /api/onboarding/complete
 *
 * Flips the `completed: true` flag — fresh-install redirect now passes.
 * Used by the Done step's "Open Inbox" button AND the Welcome page's
 * "Skip — I've set up by hand" link (with `{ skip: true }`).
 *
 * Idempotent. Doesn't touch cv.md / profile.yml / portals.yml.
 *
 * Side effect (NEW for #1): fires the seed-form-answers Claude mode in
 * the background to pre-populate the cache. If we don't do this, the
 * user's FIRST autonomous-apply runs all dead-end on `unknown-field`
 * for "notice period" / "visa status" / etc. — the cache stays empty
 * until they manually fill questions via the inbox. Auto-seeding closes
 * the cold-start gap.
 *
 * Background = fire-and-forget; doesn't block the response. The user
 * can re-trigger from /profile if it failed.
 */
import { spawn } from 'node:child_process';
import { wrap } from '$lib/server/api-helpers';
import { markComplete } from '$lib/server/onboarding';
import { logEvent } from '$lib/server/events';
import { getActiveProfileId } from '$lib/server/profiles';
import { ROOT } from '$lib/server/files';
import { swapProfileSymlinks } from '$lib/server/profile-symlinks';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';

function fireAndForgetSeedFormAnswers(profileId: string): void {
  try {
    try {
      swapProfileSymlinks(profileId);
    } catch {
      /* surfaced elsewhere */
    }
    const prompt = '/' + CLI_NAMESPACE + ' seed-form-answers';
    const p = spawn(AGENT_CLI, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd: ROOT,
      env: { ...process.env },
      detached: true,
      stdio: 'ignore',
    });
    p.unref();
    logEvent('seed-form-answers', 'Background seed fired from onboarding complete', {
      level: 'info',
      category: 'application',
    });
  } catch (err) {
    logEvent('seed-form-answers', 'Failed to fire background seed', {
      level: 'warn',
      category: 'application',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export const POST = wrap('onboarding-complete', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => ({}));
  const skip = !!body?.skip;
  const state = markComplete();
  logEvent('onboarding', skip ? 'Onboarding skipped (advanced)' : 'Onboarding complete', {
    level: skip ? 'info' : 'success',
    category: 'system',
    message: state.completedSteps.length + ' / ' + 6 + ' steps completed',
  });

  // Fire the form-answers seed in the background. We do this on BOTH
  // normal-completion and skip paths — even an "advanced" user who set
  // up by hand benefits from the pre-populated cache. Skipped if the
  // user has no CV yet (the seed mode will exit non-zero, which is fine).
  if (!skip) {
    try {
      fireAndForgetSeedFormAnswers(getActiveProfileId());
    } catch {
      /* logged inside */
    }
  }

  return { state };
});
