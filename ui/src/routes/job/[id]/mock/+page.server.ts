import { error } from '@sveltejs/kit';
import { resolveJobAndProfile } from '$lib/server/job-resolver';

export async function load({ params, url }: { params: { id: string }; url: URL }) {
  const resolved = resolveJobAndProfile(params.id, url);
  if (!resolved) {
    throw error(404, 'Job not found: ' + params.id);
  }
  return {
    job: resolved.job,
    profileId: resolved.profileId,
  };
}
