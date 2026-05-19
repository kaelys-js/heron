import { wrap, badRequest } from '$lib/server/api-helpers';
import { getProject, updateProject, deleteProject, type Project } from '$lib/server/projects';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { logEvent } from '$lib/server/events';

/** Resolve `?profile=<slug>` query → falls back to active profile. */
function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  return q && getProfile(q) ? q : getActiveProfileId();
}

export const GET = wrap(
  'projects',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const profileId = resolveProfileId(url);
    const project = getProject(profileId, params.id);
    if (!project) badRequest('Project not found: ' + params.id);
    return { project };
  },
);

export const PUT = wrap(
  'projects',
  async ({ params, request, url }: { params: { id: string }; request: Request; url: URL }) => {
    const body = (await request.json().catch(() => null)) as Partial<Project> | null;
    if (!body || typeof body !== 'object') badRequest('expected JSON project body');
    const profileId = resolveProfileId(url);
    const project = updateProject(profileId, params.id, body);
    if (!project) badRequest('Project not found: ' + params.id);
    // Activity feed (info level -- page-level success toast handles UI feedback).
    logEvent('projects', 'Project updated: ' + project.name, {
      level: 'info',
      category: 'user',
      message: 'id=' + project.id + ' · profile=' + profileId,
    });
    return { project };
  },
);

export const DELETE = wrap(
  'projects',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    // Capture name before delete so the log message is meaningful.
    const profileId = resolveProfileId(url);
    const before = getProject(profileId, params.id);
    const ok = deleteProject(profileId, params.id);
    if (!ok) badRequest('Project not found: ' + params.id);
    logEvent('projects', 'Project deleted: ' + (before?.name ?? params.id), {
      level: 'info',
      category: 'user',
      message: 'id=' + params.id + ' · profile=' + profileId,
    });
    return { ok: true };
  },
);
