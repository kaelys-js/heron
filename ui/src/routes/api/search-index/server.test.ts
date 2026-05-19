/**
 * GET /api/search-index -- compact client-side search index.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let jobs: {
  id: string;
  company: string;
  role: string;
  location?: string;
  status: string;
  score?: number;
  geminiScore?: number;
  bgRisk?: string;
}[] = [];

vi.mock('$lib/server/parsers', () => ({
  loadAllJobs: () => jobs,
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { GET } = await import('./+server');

beforeEach(() => {
  jobs = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/search-index'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/search-index', () => {
  it('returns empty array on fresh install', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.jobs).toEqual([]);
  });

  it('projects only the compact field set', async () => {
    jobs = [
      {
        id: 'j1',
        company: 'Acme',
        role: 'Eng',
        location: 'SF',
        status: 'Applied',
        score: 4.2,
        bgRisk: 'LOW',
      },
    ];
    const r = await get();
    const j = r.body.jobs[0];
    // Required compact fields present
    expect(j.id).toBe('j1');
    expect(j.company).toBe('Acme');
    expect(j.role).toBe('Eng');
    expect(j.location).toBe('SF');
    expect(j.status).toBe('Applied');
    expect(j.score).toBe(4.2);
    expect(j.bgRisk).toBe('LOW');
  });

  it('falls back to geminiScore when score is missing', async () => {
    jobs = [{ id: 'a', company: 'A', role: 'r', status: 'Scored', geminiScore: 3.5 }];
    expect((await get()).body.jobs[0].score).toBe(3.5);
  });

  it('score is null when both score + geminiScore missing', async () => {
    jobs = [{ id: 'a', company: 'A', role: 'r', status: 'Pending' }];
    expect((await get()).body.jobs[0].score).toBeNull();
  });

  it('bgRisk is null when missing', async () => {
    jobs = [{ id: 'a', company: 'A', role: 'r', status: 'Pending' }];
    expect((await get()).body.jobs[0].bgRisk).toBeNull();
  });

  it('handles a large batch (>1000 jobs) without throwing', async () => {
    jobs = Array.from({ length: 1500 }, (_, i) => ({
      id: 'j' + i,
      company: 'C' + i,
      role: 'r',
      status: 'Applied',
    }));
    const r = await get();
    expect(r.body.jobs.length).toBe(1500);
  });
});
