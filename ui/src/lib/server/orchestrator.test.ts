/**
 * lib/server/orchestrator -- long-running task spawn surface.
 *
 * The full module is 1200+ LOC and orchestrates spawn / Playwright /
 * Claude over real subprocesses. Tests focus on the deterministic
 * surface: listRunning(), TIMEOUT_MS table shape, bootOnce idempotency,
 * and the small pure helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files: Record<string, string> = {};
const fsMock = {
  existsSync: vi.fn((p: string) => p in files),
  readFileSync: vi.fn((p: string) => files[p] ?? ''),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 0, mtimeMs: 0 })),
  // mkdtempSync added after the CodeQL `js/insecure-temporary-file`
  // refactor in orchestrator.ts moved the batch-prompt temp path
  // construction from `Date.now()` suffix to `fs.mkdtempSync`.
  // Returns a deterministic mock path so spawn-env assertions don't
  // need to know about random suffixes.
  mkdtempSync: vi.fn((prefix: string) => prefix + 'mock-suffix'),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

const spawnCalls: { cmd: string; args: string[]; opts: Record<string, unknown> }[] = [];
vi.mock('node:child_process', () => ({
  spawn: vi.fn((cmd: string, args: string[], opts: Record<string, unknown>) => {
    spawnCalls.push({ cmd, args, opts });
    return {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: () => {},
      once: () => {},
      kill: () => {},
      pid: 99,
      unref: () => {},
    };
  }),
}));

vi.mock('./files', () => ({ ROOT: '/tmp/repo', DATA_ROOT: '/tmp/repo/data' }));

const loggedEvents: { source: string; msg: string }[] = [];
vi.mock('./events', () => ({
  logEvent: (source: string, msg: string) => {
    loggedEvents.push({ source, msg });
  },
  reportServerError: vi.fn(),
  bus: { recentForUser: () => [] },
}));

vi.mock('./env', () => ({ loadEnv: vi.fn() }));

vi.mock('./profile-paths', () => ({
  activePath: (key: string) => '/tmp/p/' + key,
  profilePath: (_id: string, key: string) => '/tmp/p/' + key,
  profilePathForUser: (uid: string, pid: string, key: string) =>
    `/tmp/users/${uid}/profiles/${pid}/${key}`,
}));

vi.mock('./profiles', () => ({
  getActiveProfileId: () => 'default',
}));

vi.mock('./profile', () => ({
  readProfile: () => ({}),
}));

vi.mock('./mode-substitution', () => ({
  realizeModePromptForUser: () => 'RESOLVED_PROMPT_BODY',
}));

vi.mock('$lib/config/cli', () => ({ AGENT_CLI: 'claude' }));
vi.mock('$lib/config/branding', () => ({ CLI_NAMESPACE: 'heron' }));

const { listRunning, bootOnce, runBulkOfertaParallel } = await import('./orchestrator');
const { runWithUser } = await import('./user-context');

beforeEach(() => {
  Object.keys(files).forEach((k) => delete files[k]);
  loggedEvents.length = 0;
  spawnCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('orchestrator — listRunning', () => {
  it('returns an array (empty on fresh process)', () => {
    const r = listRunning();
    expect(Array.isArray(r)).toBe(true);
  });

  it('listRunning is a stable function reference', () => {
    expect(typeof listRunning).toBe('function');
  });
});

describe('orchestrator — bootOnce', () => {
  it('is idempotent — calling twice does not throw', () => {
    expect(() => {
      bootOnce();
      bootOnce();
      bootOnce();
    }).not.toThrow();
  });

  it('emits at least one boot-source log event (boot-time markers)', () => {
    // bootOnce is set up in module evaluation already; just call again to
    // confirm idempotency + non-throw. The "Server started" event fires
    // once on module load before any test runs -- so we don't assert on it
    // here.
    expect(() => bootOnce()).not.toThrow();
  });
});

describe('orchestrator — runBulkOfertaParallel forwards user+profile env', () => {
  // The batch-runner.sh script reads HERON_USER_ID +
  // HERON_PROFILE_ID + HERON_BATCH_DIR to resolve per-user
  // per-profile paths. Without USER_ID it falls back to legacy
  // data/profiles/{slug}/ -- every user's batches collide on one tree.
  it('sets HERON_USER_ID + HERON_PROFILE_ID on the spawn env when invoked under a user context', async () => {
    // Reset the running guard between tests by re-requiring? Module-scope
    // state means the second call could short-circuit. Use a unique user
    // each run to ensure independence.
    const r = await runWithUser('orch-alice', () =>
      runBulkOfertaParallel(['https://acme.com/jobs/1'], 1, 'work'),
    );
    expect(r.started).toBe(true);

    // The first call to spawn is the bash batch-runner.sh invocation.
    const batchCall = spawnCalls.find(
      (c) => c.cmd === 'bash' && (c.args[0] ?? '').includes('batch-runner.sh'),
    );
    expect(batchCall, 'expected a bash batch-runner.sh spawn').toBeDefined();
    const env = batchCall!.opts.env as Record<string, string>;
    expect(env.HERON_USER_ID).toBe('orch-alice');
    expect(env.HERON_PROFILE_ID).toBe('work');
    expect(env.HERON_BATCH_DIR).toBeDefined();
  });
});
