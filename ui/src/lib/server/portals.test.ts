/**
 * lib/server/portals — YAML CRUD for per-profile portals.yml.
 *
 * Mocks fs + profile-paths so we can feed synthetic YAML content +
 * assert read/write behaviour without touching disk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory FS: path → string.
const files: Record<string, string> = {};

const fsMock = {
  existsSync: vi.fn((p: string) => p in files),
  readFileSync: vi.fn((p: string) => files[p] ?? ''),
  writeFileSync: vi.fn((p: string, body: string) => {
    files[p] = body;
  }),
  copyFileSync: vi.fn((src: string, dest: string) => {
    if (src in files) files[dest] = files[src];
  }),
  mkdirSync: vi.fn(),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('./files', () => ({
  ROOT: '/tmp/repo',
  readSafe: (p: string) => files[p] ?? '',
}));

vi.mock('./profile-paths', () => ({
  profilePath: (id: string, _key: string) => `/tmp/data/profiles/${id}/portals.yml`,
  ensureProfileDirs: vi.fn(),
}));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

const { readPortals, writePortalsTitleFilter } = await import('./portals');

const TEMPLATE_PATH = '/tmp/repo/templates/portals.example.yml';
const PROFILE_PATH = '/tmp/data/profiles/default/portals.yml';

beforeEach(() => {
  Object.keys(files).forEach((k) => delete files[k]);
  fsMock.existsSync.mockReset().mockImplementation((p: string) => p in files);
  fsMock.readFileSync.mockReset().mockImplementation((p: string) => files[p] ?? '');
  fsMock.writeFileSync.mockReset().mockImplementation((p: string, body: string) => {
    files[p] = body;
  });
  fsMock.copyFileSync.mockReset().mockImplementation((src: string, dest: string) => {
    if (src in files) files[dest] = files[src];
  });
  fsMock.mkdirSync.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('readPortals — fallback ladder', () => {
  it('returns source=empty when neither profile yml nor template exists', () => {
    const s = readPortals();
    expect(s.source).toBe('empty');
    expect(s.exists).toBe(false);
    expect(s.title_filter.positive).toEqual([]);
    expect(s.title_filter.negative).toEqual([]);
    expect(s.tracked_companies).toEqual([]);
  });

  it('falls back to template when profile yml is missing', () => {
    files[TEMPLATE_PATH] = `
title_filter:
  positive: [Engineer, Senior]
  negative: [Intern]
tracked_companies:
  - { name: Acme, careers_url: 'https://acme.com/jobs' }
`;
    const s = readPortals();
    expect(s.source).toBe('template');
    expect(s.exists).toBe(false);
    expect(s.title_filter.positive).toEqual(['Engineer', 'Senior']);
    expect(s.tracked_companies[0].name).toBe('Acme');
  });

  it('prefers per-profile yml over template when present', () => {
    files[TEMPLATE_PATH] = 'title_filter:\n  positive: [TemplateOnly]\n';
    files[PROFILE_PATH] = 'title_filter:\n  positive: [ProfileOnly]\n';
    const s = readPortals();
    expect(s.source).toBe('portals.yml');
    expect(s.exists).toBe(true);
    expect(s.title_filter.positive).toEqual(['ProfileOnly']);
  });

  it('tolerates malformed YAML (returns empty rather than throwing)', () => {
    files[PROFILE_PATH] = '!@#$%^&*( not yaml';
    const s = readPortals();
    expect(s.source).toBe('portals.yml');
    expect(s.title_filter.positive).toEqual([]);
  });

  it('ignores non-array tracked_companies (defensive parse)', () => {
    files[PROFILE_PATH] = 'tracked_companies: not-an-array\n';
    expect(readPortals().tracked_companies).toEqual([]);
  });

  it('ignores non-array search_queries', () => {
    files[PROFILE_PATH] = 'search_queries: { not: array }\n';
    expect(readPortals().search_queries).toEqual([]);
  });

  it('returns seniority_boost when it is an array', () => {
    files[PROFILE_PATH] = 'title_filter:\n  seniority_boost: [Staff, Principal]\n';
    expect(readPortals().title_filter.seniority_boost).toEqual(['Staff', 'Principal']);
  });

  it('returns seniority_boost=undefined when omitted', () => {
    files[PROFILE_PATH] = 'title_filter:\n  positive: [X]\n';
    expect(readPortals().title_filter.seniority_boost).toBeUndefined();
  });
});

describe('writePortalsTitleFilter — bootstrap', () => {
  it('writes a minimal yml when neither profile yml nor template exists', () => {
    writePortalsTitleFilter(['Engineer'], ['Intern']);
    expect(PROFILE_PATH in files).toBe(true);
    const written = files[PROFILE_PATH];
    expect(written).toMatch(/positive:\s*\n?\s*-\s*Engineer/);
    expect(written).toMatch(/negative:\s*\n?\s*-\s*Intern/);
  });

  it('copies the template into the profile path first (preserves curated companies)', () => {
    files[TEMPLATE_PATH] = `
title_filter:
  positive: [Old]
  negative: []
tracked_companies:
  - { name: AcmeCurated, careers_url: 'https://x' }
search_queries:
  - { name: q1, query: 'engineer' }
`;
    writePortalsTitleFilter(['New'], []);
    expect(fsMock.copyFileSync).toHaveBeenCalled();
    const after = readPortals();
    expect(after.tracked_companies[0].name).toBe('AcmeCurated');
    expect(after.title_filter.positive).toEqual(['New']);
  });
});

describe('writePortalsTitleFilter — patch', () => {
  it('updates positive + negative but preserves tracked_companies', () => {
    files[PROFILE_PATH] = `
title_filter:
  positive: [Old]
  negative: [BadOld]
tracked_companies:
  - { name: KeepMe, careers_url: 'https://x' }
search_queries:
  - { name: q, query: 'eng' }
`;
    writePortalsTitleFilter(['Senior'], ['Junior']);
    const s = readPortals();
    expect(s.title_filter.positive).toEqual(['Senior']);
    expect(s.title_filter.negative).toEqual(['Junior']);
    expect(s.tracked_companies[0].name).toBe('KeepMe');
    expect(s.search_queries[0].name).toBe('q');
  });

  it('preserves seniority_boost when overwriting positive/negative', () => {
    files[PROFILE_PATH] = `
title_filter:
  positive: [Old]
  negative: []
  seniority_boost: [Staff]
`;
    writePortalsTitleFilter(['Engineer'], []);
    expect(readPortals().title_filter.seniority_boost).toEqual(['Staff']);
  });

  it('honours 2-arg legacy form (no profileId)', () => {
    writePortalsTitleFilter(['L'], ['R']);
    expect(readPortals().title_filter).toMatchObject({
      positive: ['L'],
      negative: ['R'],
    });
  });

  it('honours 3-arg form (explicit profileId)', () => {
    writePortalsTitleFilter('default', ['A'], ['B']);
    expect(readPortals().title_filter).toMatchObject({
      positive: ['A'],
      negative: ['B'],
    });
  });
});

describe('writePortalsTitleFilter — tolerance to corruption', () => {
  it('falls back to empty title_filter when existing yml is unparseable', () => {
    files[PROFILE_PATH] = '!@#$%';
    writePortalsTitleFilter(['Fresh'], []);
    const s = readPortals();
    expect(s.title_filter.positive).toEqual(['Fresh']);
  });
});
