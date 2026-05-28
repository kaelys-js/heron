/**
 * GET + POST /api/projects -- saved-filter CRUD.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projectsStore: Record<string, { id: string; name: string }[]> = { default: [] };
const profilesList: { id: string; name: string }[] = [{ id: 'default', name: 'D' }];

vi.mock('$lib/server/projects', () => ({
  listProjects: (id: string) => projectsStore[id] ?? [],
  createProject: (id: string, input: { name: string }) => {
    const p = {
      id: input.name.toLowerCase().replace(/\s+/g, '-'),
      name: input.name,
      description: '',
      color: 'blue',
      filter: {},
      target: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    projectsStore[id] = [p, ...(projectsStore[id] ?? [])];
    return p;
  },
}));

vi.mock('$lib/server/profiles', () => ({
  getActiveProfileId: () => 'default',
  getProfile: (id: string) => profilesList.find((p) => p.id === id),
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { GET, POST } = await import('./+server');

beforeEach(() => {
  Object.keys(projectsStore).forEach((k) => {
    projectsStore[k] = [];
  });
  projectsStore['default'] = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get(url = 'http://localhost/api/projects') {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL(url),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function post(body: unknown, url = 'http://localhost/api/projects') {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL(url),
    request: new Request(url, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('gET /api/projects', () => {
  it('returns the active profile projects when no ?profile= query', async () => {
    projectsStore['default'] = [{ id: 'p1', name: 'P1' }];
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.projects.length).toBe(1);
  });

  it('honours ?profile=<slug> when profile exists', async () => {
    profilesList.push({ id: 'work', name: 'W' });
    projectsStore['work'] = [{ id: 'w1', name: 'WorkOne' }];
    const r = await get('http://localhost/api/projects?profile=work');
    expect(r.body.projects[0].id).toBe('w1');
    // cleanup
    profilesList.length = 1;
  });

  it('falls back to active profile when ?profile= names a non-existent profile', async () => {
    projectsStore['default'] = [{ id: 'd1', name: 'Default' }];
    const r = await get('http://localhost/api/projects?profile=ghost');
    expect(r.body.projects[0].id).toBe('d1');
  });
});

describe('pOST /api/projects', () => {
  it('creates a new project with the given name', async () => {
    const r = await post({ name: 'My Track' });
    expect(r.status).toBe(200);
    expect(r.body.project.name).toBe('My Track');
  });

  it('400 when JSON body is not an object', async () => {
    const r = await post('null');
    expect(r.status).toBe(400);
  });

  it('400 when name is missing', async () => {
    const r = await post({});
    expect(r.status).toBe(400);
  });

  it('400 when name is empty/whitespace-only', async () => {
    const r = await post({ name: '   ' });
    expect(r.status).toBe(400);
  });

  it('400 when name is not a string', async () => {
    const r = await post({ name: 123 });
    expect(r.status).toBe(400);
  });
});
