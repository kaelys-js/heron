import { wrap, badRequest } from '$lib/server/api-helpers';
import { getProject, updateProject, deleteProject, type Project } from '$lib/server/projects';
import { logEvent } from '$lib/server/events';

export const GET = wrap('projects', async ({ params }: { params: { id: string } }) => {
  const project = getProject(params.id);
  if (!project) badRequest('Project not found: ' + params.id);
  return { project };
});

export const PUT = wrap('projects', async ({ params, request }: { params: { id: string }; request: Request }) => {
  const body = (await request.json().catch(() => null)) as Partial<Project> | null;
  if (!body || typeof body !== 'object') badRequest('expected JSON project body');
  const project = updateProject(params.id, body);
  if (!project) badRequest('Project not found: ' + params.id);
  // Activity feed (info level — page-level success toast handles UI feedback).
  logEvent('projects', 'Project updated: ' + project.name, {
    level: 'info',
    category: 'user',
    message: 'id=' + project.id,
  });
  return { project };
});

export const DELETE = wrap('projects', async ({ params }: { params: { id: string } }) => {
  // Capture name before delete so the log message is meaningful.
  const before = getProject(params.id);
  const ok = deleteProject(params.id);
  if (!ok) badRequest('Project not found: ' + params.id);
  logEvent('projects', 'Project deleted: ' + (before?.name ?? params.id), {
    level: 'info',
    category: 'user',
    message: 'id=' + params.id,
  });
  return { ok: true };
});
