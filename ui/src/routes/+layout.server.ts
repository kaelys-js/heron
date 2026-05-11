import { redirect } from '@sveltejs/kit';
import { loadAllJobs } from '$lib/server/parsers';
import { isFreshInstall } from '$lib/server/onboarding';
import { readProfiles } from '$lib/server/profiles';

/**
 * Layout-level loader. Three responsibilities:
 *
 *   1. **First-run redirect** — fresh installs (missing cv.md / profile.yml /
 *      portals.yml / modes/_profile.md / ANTHROPIC_API_KEY) get bounced to
 *      /onboarding. The wizard's own routes are exempt to avoid an infinite
 *      loop, and so are /api/* routes (the wizard hits them mid-flow).
 *
 *   2. **Profile state** — the active profile + the full profile list, so
 *      the sidebar profile-switcher dropdown can render without a separate
 *      fetch.
 *
 *   3. **Sidebar data** — pinned jobs, inbox count, queue count for the
 *      AppSidebar's badges. Computed against the ACTIVE profile only.
 */
export async function load({ url }: { url: URL }) {
  if (
    isFreshInstall() &&
    !url.pathname.startsWith('/onboarding') &&
    !url.pathname.startsWith('/api') &&
    !url.pathname.startsWith('/help')
  ) {
    throw redirect(302, '/onboarding');
  }

  const profilesState = readProfiles();
  const activeProfile = profilesState.profiles.find((p) => p.id === profilesState.activeId)
    ?? profilesState.profiles[0];

  const jobs = loadAllJobs(); // active profile
  const ready = jobs.filter((j) => j.status === 'Ready');
  const inboxCount = jobs.filter((j) => (j.score ?? j.geminiScore ?? 0) >= 4 && (j.status === 'Scored' || j.status === 'New')).length;
  const queueCount = jobs.filter((j) => j.status === 'Queued').length;
  return {
    profilesState,
    activeProfile,
    inboxCount,
    queueCount,
    pinnedJobs: ready.slice(0, 8).map((j) => ({ id: j.id, company: j.company, role: j.role })),
  };
}
