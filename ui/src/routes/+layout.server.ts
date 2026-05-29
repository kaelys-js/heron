import { redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { dev, building } from '$app/environment';
import { devGalleryUnlocked } from '$lib/server/dev-gate';
import { loadAllJobs } from '$lib/server/parsers';
import { isFreshInstall } from '$lib/server/onboarding';
import { resolveLandingRedirect } from '$lib/server/landing';
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
  // Landing decision (auth BEFORE onboarding): unauthenticated traffic goes to
  // /login (which routes the first owner onward to /signup); only an
  // authenticated user with an incomplete profile is sent to the /onboarding
  // wizard. `building` is excluded so adapter-static's fallback generation
  // (no session) doesn't 302 and abort the static build -- same guard as the
  // hooks auth gate. See lib/server/landing.ts for the full precedence + the
  // regression this fixes (fresh+unauthenticated used to hit /onboarding/account).
  const landingTarget = resolveLandingRedirect({
    pathname: url.pathname,
    search: url.search,
    hasUser: !!locals.user,
    isFresh: isFreshInstall(),
    devUnlocked,
  });
  if (landingTarget && !building) {
    throw redirect(302, landingTarget);
  }

  // Unauthenticated traffic skips the per-user data fetches. The pages
  // that need profile state (/, /pipeline, /job/*, /settings, …) are
  // already protected by the hooks middleware; the only requests that
  // can reach this branch without a session are the public auth pages.
  if (!locals.user) {
    return {
      authed: false,
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
    authed: true,
    profilesState,
    activeProfile,
    profileAutomations,
    inboxCount,
    queueCount,
    pinnedJobs: ready.slice(0, 8).map((j) => ({ id: j.id, company: j.company, role: j.role })),
  };
}
