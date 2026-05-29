import { redirect } from '@sveltejs/kit';
import { building } from '$app/environment';

/**
 * The dashboard's landing page is the Inbox -- high-fit jobs awaiting review.
 * The full kanban Pipeline lives at /pipeline. Project deep links carry their
 * filter params through this redirect so they keep working.
 *
 * `building` short-circuit: SvelteKit's adapter-static (used for the
 * Capacitor wrapper build) generates a fallback page by SSR-rendering this
 * route. Any non-200 response -- including the 307 redirects below --
 * causes `Could not create a fallback page -- failed with status 302`.
 * So during the build phase we return nothing; the companion `+page.svelte`
 * then performs the same redirect client-side after hydration. The runtime
 * SSR path (node adapter, real requests) is unaffected.
 */
export async function load({ url }: { url: URL }) {
  if (building) {
    return {};
  }
  const { search } = url; // includes leading "?" or empty string
  // Project deep-links target the Pipeline. Forward those preserved.
  if (
    url.searchParams.has('from') ||
    url.searchParams.has('score') ||
    url.searchParams.has('search') ||
    url.searchParams.has('bg') ||
    url.searchParams.has('tab') ||
    url.searchParams.has('pdf') ||
    url.searchParams.has('report')
  ) {
    throw redirect(307, `/pipeline${search}`);
  }
  throw redirect(307, '/inbox');
}
