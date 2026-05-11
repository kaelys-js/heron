import { redirect } from '@sveltejs/kit';
import { loadAllJobs } from '$lib/server/parsers';
import { isFreshInstall } from '$lib/server/onboarding';
import { readProfiles } from '$lib/server/profiles';
import { readProfile } from '$lib/server/profile';

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

  // Surface every profile's automation block so JobActions can flip the
  // Apply button to "queue-apply" (single click) when the JOB's profile
  // has autonomous_apply ON. We expose ALL profiles (not just the active
  // one) because the pipeline view can show cross-profile jobs.
  const profileAutomations: Record<string, {
    autonomous_apply?: boolean;
    warmup_days?: number;
    min_score_to_apply?: number;
    enabled_portals?: string[];
    enabled_at?: number;
  }> = {};
  for (const p of profilesState.profiles) {
    try {
      const pr = readProfile(p.id) as unknown as { automation?: typeof profileAutomations[string] };
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
