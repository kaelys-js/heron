import { redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { devGalleryUnlocked } from '$lib/server/dev-gate';
import { loadAllJobs } from '$lib/server/parsers';
import { isFreshInstall } from '$lib/server/onboarding';
import { readProfiles } from '$lib/server/profiles';
import { readProfile } from '$lib/server/profile';

/**
 * Layout-level loader. Four responsibilities:
 *
 *   1. **First-run redirect** -- fresh installs (missing cv.md / profile.yml /
 *      portals.yml / modes/_profile.md / ANTHROPIC_API_KEY) get bounced to
 *      /onboarding. The wizard's own routes are exempt to avoid an infinite
 *      loop, and so are /api/* routes (the wizard hits them mid-flow).
 *
 *   2. **Unauthenticated bypass** -- anonymous traffic on public auth pages
 *      (/login, /signup, /onboarding/account, root) doesn't need the
 *      profile + sidebar payload. Return a minimal shape so the layout
 *      renders without spending a DB round-trip.
 *
 *   3. **Profile state** -- the active profile + the full profile list, so
 *      the sidebar profile-switcher dropdown can render without a separate
 *      fetch.
 *
 *   4. **Sidebar data** -- pinned jobs, inbox count, queue count for the
 *      AppSidebar's badges. Computed against the ACTIVE profile only.
 */
export async function load({
  url,
  locals,
  cookies,
}: {
  url: URL;
  locals: App.Locals;
  cookies: Cookies;
}) {
  const devUnlocked = devGalleryUnlocked(dev, cookies);
  if (
    isFreshInstall() &&
    !url.pathname.startsWith('/onboarding') &&
    !url.pathname.startsWith('/api') &&
    !url.pathname.startsWith('/help') &&
    // View gallery is exempt so it opens directly -- under the live dev server
    // or when the owner has opted into developer tools in a built app.
    !(devUnlocked && url.pathname.startsWith('/dev')) &&
    // Multi-user auth pages bypass the onboarding redirect. A user who
    // already has an account on a fresh install (e.g. partner being
    // invited) needs to reach /login or /signup directly.
    !url.pathname.startsWith('/login') &&
    !url.pathname.startsWith('/signup')
  ) {
    throw redirect(302, '/onboarding');
  }

  // Unauthenticated traffic skips the per-user data fetches. The pages
  // that need profile state (/, /pipeline, /job/*, /settings, …) are
  // already protected by the hooks middleware; the only requests that
  // can reach this branch without a session are the public auth pages.
  if (!locals.user) {
    return {
      profilesState: { activeId: 'default', profiles: [] as never[] },
      activeProfile: undefined,
      profileAutomations: {} as Record<
        string,
        {
          autonomous_apply?: boolean;
          warmup_days?: number;
          min_score_to_apply?: number;
          enabled_portals?: string[];
          enabled_at?: number;
        }
      >,
      inboxCount: 0,
      queueCount: 0,
      pinnedJobs: [] as Array<{ id: string; company: string; role: string }>,
    };
  }

  const profilesState = readProfiles();
  const activeProfile =
    profilesState.profiles.find((p) => p.id === profilesState.activeId) ??
    profilesState.profiles[0];

  const jobs = loadAllJobs(); // active profile
  const ready = jobs.filter((j) => j.status === 'Ready');
  const inboxCount = jobs.filter(
    (j) => (j.score ?? j.geminiScore ?? 0) >= 4 && (j.status === 'Scored' || j.status === 'New'),
  ).length;
  const queueCount = jobs.filter((j) => j.status === 'Queued').length;

  // Surface every profile's automation block so JobActions can flip the
  // Apply button to "queue-apply" (single click) when the JOB's profile
  // has autonomous_apply ON. We expose ALL profiles (not just the active
  // one) because the pipeline view can show cross-profile jobs.
  const profileAutomations: Record<
    string,
    {
      autonomous_apply?: boolean;
      warmup_days?: number;
      min_score_to_apply?: number;
      enabled_portals?: string[];
      enabled_at?: number;
    }
  > = {};
  for (const p of profilesState.profiles) {
    try {
      const pr = readProfile(p.id) as unknown as {
        automation?: (typeof profileAutomations)[string];
      };
      profileAutomations[p.id] = pr.automation ?? {};
    } catch {
      profileAutomations[p.id] = {};
    }
  }

  return {
    profilesState,
    activeProfile,
    profileAutomations,
    inboxCount,
    queueCount,
    pinnedJobs: ready.slice(0, 8).map((j) => ({ id: j.id, company: j.company, role: j.role })),
  };
}
