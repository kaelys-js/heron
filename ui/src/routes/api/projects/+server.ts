import { wrap, badRequest } from '$lib/server/api-helpers';
import { listProjects, createProject, type Project } from '$lib/server/projects';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { logEvent } from '$lib/server/events';

/** Resolve `?profile=<slug>` query → falls back to active profile. */
function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  return q && getProfile(q) ? q : getActiveProfileId();
}

export const GET = wrap('projects', async ({ url }: { url: URL }) => {
  return { projects: listProjects(resolveProfileId(url)) };
});

export const POST = wrap('projects', async ({ request, url }: { request: Request; url: URL }) => {
  const body = (await request.json().catch(() => null)) as Partial<Project> | null;
  if (!body || typeof body !== 'object') badRequest('expected JSON project body');
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    badRequest('project name is required', { field: 'name' });
  }
  const profileId = resolveProfileId(url);
  const project = createProject(profileId, body);
  // info level -- the Projects page already toasts "Project created" inline,
  // so we only need the activity-feed entry here for telemetry.
  logEvent('projects', 'Project created: ' + project.name, {
    level: 'info',
    category: 'user',
    message:
      'id=' +
      project.id +
      ' · color=' +
      project.color +
      ' · target=' +
      project.target +
      ' · profile=' +
      profileId,
  });
  return { project };
});
