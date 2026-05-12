import { redirect } from '@sveltejs/kit';

/**
 * The dashboard's landing page is the Inbox — high-fit jobs awaiting review.
 * The full kanban Pipeline lives at /pipeline. Project deep links carry their
 * filter params through this redirect so they keep working.
 */
export async function load({ url }: { url: URL }) {
  const search = url.search; // includes leading "?" or empty string
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
    throw redirect(307, '/pipeline' + search);
  }
  throw redirect(307, '/inbox');
}
