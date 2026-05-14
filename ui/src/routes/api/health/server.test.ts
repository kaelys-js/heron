/**
 * GET /api/health — aggregate health check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeStats: Record<string, { mtime: number; size: number }> = {};
const fakeDirs: Record<string, string[]> = {};
const fsMock = {
  statSync: vi.fn((p: string) => {
    const f = fakeStats[p];
    if (!f) throw new Error('ENOENT');
    return { size: f.size, mtimeMs: f.mtime };
  }),
  readdirSync: vi.fn((p: string) => fakeDirs[p] ?? []),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

let running: { id: string }[] = [];
vi.mock('$lib/server/orchestrator', () => ({
  listRunning: () => running,
}));

vi.mock('$lib/server/profile-paths', () => ({
  activePath: (key: string) => {
    if (key === 'pipeline') return '/p/pipeline.md';
    if (key === 'gemini-scores') return '/p/gemini-scores.tsv';
    if (key === 'reports-dir') return '/p/reports';
    return '/p/' + key;
  },
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { GET } = await import('./+server');

beforeEach(() => {
  Object.keys(fakeStats).forEach((k) => delete fakeStats[k]);
  Object.keys(fakeDirs).forEach((k) => delete fakeDirs[k]);
  running = [];
  fsMock.statSync.mockClear();
  fsMock.readdirSync.mockClear();
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function call(): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/health'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/health', () => {
  it('returns 200 with envelope { ok: true, ... }', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('reports pipeline.exists=false when pipeline.md is missing', async () => {
    const r = await call();
    const p = (r.body as { pipeline: { exists: boolean } }).pipeline;
    expect(p.exists).toBe(false);
  });

  it('reports pipeline.exists=true with size + mtime when present', async () => {
    fakeStats['/p/pipeline.md'] = { mtime: Date.now(), size: 500 };
    const r = await call();
    const p = (r.body as { pipeline: { exists: boolean; size: number; stale: boolean } }).pipeline;
    expect(p.exists).toBe(true);
    expect(p.size).toBe(500);
    expect(p.stale).toBe(false);
  });

  it('reports pipeline.stale=true when pipeline mtime is > 7 days old', async () => {
    fakeStats['/p/pipeline.md'] = {
      mtime: Date.now() - 8 * 24 * 60 * 60 * 1000,
      size: 100,
    };
    const r = await call();
    expect((r.body as { pipeline: { stale: boolean } }).pipeline.stale).toBe(true);
  });

  it('reports pipeline.stale=true when pipeline is missing entirely', async () => {
    const r = await call();
    expect((r.body as { pipeline: { stale: boolean } }).pipeline.stale).toBe(true);
  });

  it('counts only .md files in reports dir', async () => {
    fakeDirs['/p/reports'] = ['001.md', '002.md', 'notes.txt', '003.md', 'README.md'];
    const r = await call();
    expect((r.body as { reports: { count: number } }).reports.count).toBe(4);
  });

  it('reports gemini.keyConfigured=true when GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const r = await call();
    expect((r.body as { gemini: { keyConfigured: boolean } }).gemini.keyConfigured).toBe(true);
  });

  it('reports anthropic.keyConfigured=true when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    const r = await call();
    expect((r.body as { anthropic: { keyConfigured: boolean } }).anthropic.keyConfigured).toBe(
      true,
    );
  });

  it('passes through runningTasks from orchestrator', async () => {
    running = [{ id: 'scan' }, { id: 'gemini' }];
    const r = await call();
    expect((r.body as { runningTasks: { id: string }[] }).runningTasks.length).toBe(2);
  });

  it('exposes lastScanAt = pipeline mtime when pipeline exists', async () => {
    fakeStats['/p/pipeline.md'] = { mtime: 1234, size: 1 };
    const r = await call();
    expect((r.body as { lastScanAt: number }).lastScanAt).toBe(1234);
  });

  it('lastScanAt is null when pipeline.md is missing', async () => {
    const r = await call();
    expect((r.body as { lastScanAt: number | null }).lastScanAt).toBeNull();
  });
});
