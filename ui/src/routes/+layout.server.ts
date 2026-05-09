import { redirect } from '@sveltejs/kit';
import { loadAllJobs } from '$lib/server/parsers';
import { isFreshInstall } from '$lib/server/onboarding';

/**
 * Layout-level loader. Two responsibilities:
 *
 *   1. **First-run redirect** — fresh installs (missing cv.md / profile.yml /
 *      portals.yml / modes/_profile.md / ANTHROPIC_API_KEY) get bounced to
 *      /onboarding. The wizard's own routes are exempt to avoid an infinite
 *      loop, and so are /api/* routes (the wizard hits them mid-flow).
 *
 *   2. **Sidebar data** — pinned jobs, inbox count, queue count for the
 *      AppSidebar's badges. Only computed when we're not redirecting.
 */
export async function load({ url }: { url: URL }) {
  if (
    isFreshInstall() &&
    !url.pathname.startsWith('/onboarding') &&
    !url.pathname.startsWith('/api') &&
    // The /help/* tree should still be reachable so users can read docs
    // even before completing onboarding (in case the wizard itself
    // confuses them). Same for the static /icon assets etc.
    !url.pathname.startsWith('/help')
  ) {
    throw redirect(302, '/onboarding');
  }

  const jobs = loadAllJobs();
  const ready = jobs.filter((j) => j.status === 'Ready');
  const inboxCount = jobs.filter((j) => (j.score ?? j.geminiScore ?? 0) >= 4 && (j.status === 'Scored' || j.status === 'New')).length;
  const queueCount = jobs.filter((j) => j.status === 'Queued').length;
  return {
    inboxCount,
    queueCount,
    pinnedJobs: ready.slice(0, 8).map((j) => ({ id: j.id, company: j.company, role: j.role })),
  };
}
