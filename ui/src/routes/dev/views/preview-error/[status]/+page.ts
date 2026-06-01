/**
 * Dev-only error-page preview. Navigating here throws the requested HTTP status
 * so the root `+error.svelte` renders its preset for that code (500, 403, …) --
 * the gallery uses it to preview non-404 error states without a real failure.
 * Gated on the build-time `dev` flag so the route can't surface a fake error
 * page in production.
 */
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const prerender = false;

export const load: PageLoad = ({ params }) => {
  if (!dev) throw error(404, 'Not found');
  const status = Number(params.status);
  throw error(
    Number.isFinite(status) && status >= 400 ? status : 500,
    `Preview ${params.status} error`,
  );
};
