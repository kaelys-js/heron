/**
 * lib/server/followup-cadence — spawns scripts/tracker/followup-cadence.mjs + caches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

type FakeProc = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

let nextOutcome: { stdout: string; stderr?: string; exitCode?: number; errors?: Error } = {
  stdout: '',
};
const spawnCalls: { script: string; args: string[] }[] = [];

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_node: string, allArgs: string[]) => {
    const p = new EventEmitter() as FakeProc;
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    spawnCalls.push({ script: allArgs[0], args: allArgs.slice(1) });
    queueMicrotask(() => {
      if (nextOutcome.errors) {
        p.emit('error', nextOutcome.errors);
        return;
      }
      if (nextOutcome.stdout) p.stdout.emit('data', Buffer.from(nextOutcome.stdout));
      if (nextOutcome.stderr) p.stderr.emit('data', Buffer.from(nextOutcome.stderr));
      p.emit('close', nextOutcome.exitCode ?? 0);
    });
    return p;
  }),
}));

const files: Record<string, string> = {};
const fsMock = {
  existsSync: vi.fn((p: string) => p in files),
  readFileSync: vi.fn((p: string) => files[p] ?? ''),
  writeFileSync: vi.fn((p: string, body: string) => {
    files[p] = body;
  }),
  mkdirSync: vi.fn(),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

vi.mock('./files', () => ({ ROOT: '/tmp/repo' }));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

const { getFollowupCadence, findEntryByCompanyRole } = await import('./followup-cadence');

// Per-profile cache path post-Option-E. Resolved via activePath()
// against the mocked default profile + SYSTEM_USER_ID.
const CACHE_PATH = '/tmp/repo/data/profiles/default/followup-cache.json';

beforeEach(() => {
  spawnCalls.length = 0;
  nextOutcome = { stdout: '' };
  Object.keys(files).forEach((k) => delete files[k]);
  fsMock.existsSync.mockReset().mockImplementation((p: string) => p in files);
  fsMock.readFileSync.mockReset().mockImplementation((p: string) => files[p] ?? '');
  fsMock.writeFileSync.mockReset().mockImplementation((p: string, body: string) => {
    files[p] = body;
  });
  fsMock.mkdirSync.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const sampleJson = JSON.stringify({
  metadata: {
    analysisDate: '2026-05-14',
    totalTracked: 3,
    actionable: 1,
    overdue: 0,
    urgent: 1,
    cold: 1,
    waiting: 1,
  },
  entries: [
    {
      num: '001',
      date: '2026-05-01',
      company: 'Acme',
      role: 'Engineer',
      status: 'Applied',
      contacts: [],
      daysSinceApplication: 13,
      daysSinceLastFollowup: null,
      followupCount: 0,
      urgency: 'urgent',
      nextFollowupDate: '2026-05-15',
      daysUntilNext: 1,
    },
  ],
  cadenceConfig: { applied_initial: 7 },
});

describe('getFollowupCadence — fresh spawn path', () => {
  it('spawns scripts/tracker/followup-cadence.mjs as the underlying script', async () => {
    nextOutcome.stdout = sampleJson;
    await getFollowupCadence({ force: true });
    expect(spawnCalls[0].script).toBe('scripts/tracker/followup-cadence.mjs');
  });

  it('honours explicit profileId argument via --profile flag', async () => {
    nextOutcome.stdout = sampleJson;
    await getFollowupCadence({ profileId: 'work', force: true });
    expect(spawnCalls[0].args).toContain('--profile');
    expect(spawnCalls[0].args).toContain('work');
  });

  it('parses JSON + stamps generatedAt', async () => {
    nextOutcome.stdout = sampleJson;
    const before = Date.now();
    const r = await getFollowupCadence({ force: true });
    expect(r.entries[0].company).toBe('Acme');
    expect(r.generatedAt).toBeGreaterThanOrEqual(before);
  });

  it('writes the cache file after a fresh spawn', async () => {
    nextOutcome.stdout = sampleJson;
    await getFollowupCadence({ force: true });
    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(CACHE_PATH in files).toBe(true);
  });

  it('rejects on non-zero exit', async () => {
    nextOutcome.stdout = '';
    nextOutcome.stderr = 'boom';
    nextOutcome.exitCode = 1;
    await expect(getFollowupCadence({ force: true })).rejects.toThrow(/followup-cadence/);
  });

  it('rejects on malformed JSON', async () => {
    nextOutcome.stdout = 'not-json';
    await expect(getFollowupCadence({ force: true })).rejects.toThrow(/parse/);
  });

  it('rejects on spawn error', async () => {
    nextOutcome.errors = new Error('ENOENT: node');
    await expect(getFollowupCadence({ force: true })).rejects.toThrow(/ENOENT/);
  });
});

describe('getFollowupCadence — cache path', () => {
  it('returns the cached value when fresh (≤ 5 min)', async () => {
    files[CACHE_PATH] = JSON.stringify({
      metadata: {
        analysisDate: '2026-05-13',
        totalTracked: 0,
        actionable: 0,
        overdue: 0,
        urgent: 0,
        cold: 0,
        waiting: 0,
      },
      entries: [],
      cadenceConfig: {},
      generatedAt: Date.now() - 60_000, // 1 minute old
    });
    const r = await getFollowupCadence();
    expect(r.metadata.analysisDate).toBe('2026-05-13');
    expect(spawnCalls.length).toBe(0);
  });

  it('ignores stale cache (> 5 min) + re-spawns', async () => {
    files[CACHE_PATH] = JSON.stringify({
      metadata: {
        analysisDate: '2026-05-01',
        totalTracked: 0,
        actionable: 0,
        overdue: 0,
        urgent: 0,
        cold: 0,
        waiting: 0,
      },
      entries: [],
      cadenceConfig: {},
      generatedAt: Date.now() - 6 * 60_000, // 6 minutes old
    });
    nextOutcome.stdout = sampleJson;
    const r = await getFollowupCadence();
    expect(r.metadata.analysisDate).toBe('2026-05-14');
    expect(spawnCalls.length).toBe(1);
  });

  it('force=true skips cache even when fresh', async () => {
    files[CACHE_PATH] = JSON.stringify({
      metadata: {
        analysisDate: 'OLD',
        totalTracked: 0,
        actionable: 0,
        overdue: 0,
        urgent: 0,
        cold: 0,
        waiting: 0,
      },
      entries: [],
      cadenceConfig: {},
      generatedAt: Date.now() - 1_000,
    });
    nextOutcome.stdout = sampleJson;
    const r = await getFollowupCadence({ force: true });
    expect(r.metadata.analysisDate).toBe('2026-05-14');
  });

  it('tolerates corrupt cache JSON (treats as no cache)', async () => {
    files[CACHE_PATH] = '!@#$ not json';
    nextOutcome.stdout = sampleJson;
    const r = await getFollowupCadence();
    expect(r.metadata.analysisDate).toBe('2026-05-14');
  });
});

describe('findEntryByCompanyRole', () => {
  const cadence = {
    metadata: {
      analysisDate: '2026-05-14',
      totalTracked: 0,
      actionable: 0,
      overdue: 0,
      urgent: 0,
      cold: 0,
      waiting: 0,
    },
    entries: [
      {
        num: '1',
        date: '',
        company: 'Acme',
        role: 'Engineer',
        status: 'Applied',
        contacts: [],
        daysSinceApplication: 0,
        daysSinceLastFollowup: null,
        followupCount: 0,
        urgency: 'urgent' as const,
        nextFollowupDate: null,
        daysUntilNext: null,
      },
      {
        num: '2',
        date: '',
        company: 'Acme',
        role: 'Manager',
        status: 'Applied',
        contacts: [],
        daysSinceApplication: 0,
        daysSinceLastFollowup: null,
        followupCount: 0,
        urgency: 'cold' as const,
        nextFollowupDate: null,
        daysUntilNext: null,
      },
    ],
    cadenceConfig: {},
    generatedAt: Date.now(),
  };

  it('matches exact company + role', () => {
    expect(findEntryByCompanyRole(cadence, 'Acme', 'Engineer')?.num).toBe('1');
    expect(findEntryByCompanyRole(cadence, 'Acme', 'Manager')?.num).toBe('2');
  });

  it('case-insensitive', () => {
    expect(findEntryByCompanyRole(cadence, 'ACME', 'engineer')?.num).toBe('1');
  });

  it('trims whitespace', () => {
    expect(findEntryByCompanyRole(cadence, '  Acme  ', 'Engineer')?.num).toBe('1');
  });

  it('falls back to company-only when role does not match', () => {
    expect(findEntryByCompanyRole(cadence, 'Acme', 'Ghost')?.num).toBe('1');
  });

  it('returns null when company is empty', () => {
    expect(findEntryByCompanyRole(cadence, '', 'Engineer')).toBeNull();
  });

  it('returns null when nothing matches at all', () => {
    expect(findEntryByCompanyRole(cadence, 'Nope', 'Engineer')).toBeNull();
  });
});
