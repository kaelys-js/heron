import { wrap, badRequest } from '$lib/server/api-helpers';
import { listProjects, createProject, type Project } from '$lib/server/projects';
import { logEvent } from '$lib/server/events';

export const GET = wrap('projects', async () => ({ projects: listProjects() }));

export const POST = wrap('projects', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as Partial<Project> | null;
  if (!body || typeof body !== 'object') badRequest('expected JSON project body');
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    badRequest('project name is required', { field: 'name' });
  }
  const project = createProject(body);
  // info level — the Projects page already toasts "Project created" inline,
  // so we only need the activity-feed entry here for telemetry.
  logEvent('projects', 'Project created: ' + project.name, {
    level: 'info',
    category: 'user',
    message: 'id=' + project.id + ' · color=' + project.color + ' · target=' + project.target,
  });
  return { project };
});
