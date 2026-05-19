/**
 * lib/server/projects -- saved filter profile CRUD (per career profile).
 *
 * Mocks the fs + profile-paths so we can exercise the full lifecycle
 * (create / list / get / update / delete) on an in-memory file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockFile: string | null = null;
const fsMock = {
  existsSync: vi.fn(() => mockFile !== null),
  readFileSync: vi.fn(() => mockFile ?? '[]'),
  writeFileSync: vi.fn((_p: string, body: string) => {
    mockFile = body;
  }),
  mkdirSync: vi.fn(),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('./profile-paths', () => ({
  profilePath: (_id: string, _key: string) => '/tmp/projects.json',
}));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

const {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getStarterTemplates,
  PROJECT_COLORS,
} = await import('./projects');

beforeEach(() => {
  mockFile = null;
  fsMock.existsSync.mockReset().mockImplementation(() => mockFile !== null);
  fsMock.readFileSync.mockReset().mockImplementation(() => mockFile ?? '[]');
  fsMock.writeFileSync.mockReset().mockImplementation((_p: string, body: string) => {
    mockFile = body;
  });
  fsMock.mkdirSync.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('projects — constants', () => {
  it('exposes 8 project colors', () => {
    expect(PROJECT_COLORS).toHaveLength(8);
    expect(PROJECT_COLORS).toContain('emerald');
    expect(PROJECT_COLORS).toContain('blue');
  });

  it('starter templates are deep-cloned (mutation does not bleed)', () => {
    const a = getStarterTemplates();
    a[0].filter.minScore = 999;
    const b = getStarterTemplates();
    expect(b[0].filter.minScore).not.toBe(999);
  });

  it('starter templates include "Top scorers" + "Ready to send"', () => {
    const names = getStarterTemplates().map((t) => t.name);
    expect(names).toContain('Top scorers');
    expect(names).toContain('Ready to send');
  });
});

describe('projects — createProject', () => {
  it('returns a Project with id derived from name', () => {
    const p = createProject({ name: 'My Tracks' });
    expect(p.id).toMatch(/my/i);
    expect(p.name).toBe('My Tracks');
  });

  it('defaults empty name to "Untitled"', () => {
    const p = createProject({ name: '   ' });
    expect(p.name).toBe('Untitled');
  });

  it('assigns a color from PROJECT_COLORS rotating by index', () => {
    const p1 = createProject({ name: 'P1' });
    const p2 = createProject({ name: 'P2' });
    expect(PROJECT_COLORS).toContain(p1.color);
    expect(PROJECT_COLORS).toContain(p2.color);
    // Different rotation indices → different colors
    expect(p1.color).not.toBe(p2.color);
  });

  it('clamps negative targets to 0', () => {
    const p = createProject({ name: 'P', target: -5 });
    expect(p.target).toBe(0);
  });

  it('floors non-integer targets', () => {
    const p = createProject({ name: 'P', target: 3.7 });
    expect(p.target).toBe(3);
  });

  it('sets createdAt + updatedAt to roughly now()', () => {
    const before = Date.now();
    const p = createProject({ name: 'P' });
    expect(p.createdAt).toBeGreaterThanOrEqual(before);
    expect(p.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('inserts new projects at the FRONT of the list', () => {
    createProject({ name: 'First' });
    createProject({ name: 'Second' });
    const all = listProjects();
    expect(all[0].name).toBe('Second');
    expect(all[1].name).toBe('First');
  });
});

describe('projects — getProject', () => {
  it('returns null for unknown id', () => {
    expect(getProject('nothing')).toBeNull();
  });

  it('finds an existing project by id (legacy 1-arg)', () => {
    const created = createProject({ name: 'Findme' });
    const found = getProject(created.id);
    expect(found?.id).toBe(created.id);
  });

  it('finds an existing project by id (2-arg: profile, id)', () => {
    const created = createProject({ name: 'Findme' });
    const found = getProject('default', created.id);
    expect(found?.id).toBe(created.id);
  });
});

describe('projects — updateProject', () => {
  it('returns null when id does not exist', () => {
    expect(updateProject('missing', { name: 'X' })).toBeNull();
  });

  it('patches name + description', () => {
    const p = createProject({ name: 'Old' });
    const next = updateProject(p.id, { name: 'New', description: 'desc' });
    expect(next?.name).toBe('New');
    expect(next?.description).toBe('desc');
  });

  it('id + createdAt are immutable', () => {
    const p = createProject({ name: 'P' });
    const orig = { id: p.id, createdAt: p.createdAt };
    const next = updateProject(p.id, {
      id: 'spoofed',
      createdAt: 1,
      name: 'newname',
    } as never);
    expect(next?.id).toBe(orig.id);
    expect(next?.createdAt).toBe(orig.createdAt);
  });

  it('updatedAt advances on every patch', async () => {
    const p = createProject({ name: 'P' });
    await new Promise((r) => setTimeout(r, 5));
    const next = updateProject(p.id, { description: 'd' });
    expect(next!.updatedAt).toBeGreaterThan(p.updatedAt);
  });
});

describe('projects — deleteProject', () => {
  it('returns true when a project was removed', () => {
    const p = createProject({ name: 'Delete' });
    expect(deleteProject(p.id)).toBe(true);
    expect(getProject(p.id)).toBeNull();
  });

  it('returns false for unknown id (no-op)', () => {
    createProject({ name: 'Keep' });
    expect(deleteProject('nothing')).toBe(false);
    expect(listProjects().length).toBe(1);
  });
});

describe('projects — listProjects', () => {
  it('returns [] when file does not exist', () => {
    expect(listProjects()).toEqual([]);
  });

  it('returns [] when file is malformed JSON', () => {
    mockFile = '{not-json';
    expect(listProjects()).toEqual([]);
  });

  it('returns [] when JSON parses but is not an array', () => {
    mockFile = JSON.stringify({ foo: 'bar' });
    expect(listProjects()).toEqual([]);
  });

  it('filters out rows missing required fields', () => {
    mockFile = JSON.stringify([{ id: 'ok', name: 'OK' }, { id: 123 }, { name: 'no-id' }]);
    const list = listProjects();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('ok');
  });

  it('sorts by updatedAt DESC (most recent first)', () => {
    // Two synthetic projects with deterministic updatedAt timestamps.
    mockFile = JSON.stringify([
      {
        id: 'old',
        name: 'Older',
        description: '',
        color: 'emerald',
        filter: {},
        target: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'new',
        name: 'Newer',
        description: '',
        color: 'blue',
        filter: {},
        target: 0,
        createdAt: 2,
        updatedAt: 999,
      },
    ]);
    const list = listProjects();
    expect(list[0].name).toBe('Newer');
    expect(list[1].name).toBe('Older');
  });
});
