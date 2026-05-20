/**
 * autopilot.test -- config CRUD + nextRunAt scheduling logic.
 *
 * Covers the testable surface: readConfig/writeConfig/patchConfig
 * (single-user) + readConfigForUser/writeConfigForUser/patchConfigForUser
 * (multi-user), mergeWithDefaults defaults, nextRunAt for daily/weekly/
 * disabled/after triggers, runScheduleNow guard branches.
 *
 * The actual task spawning (runTask, child_process via orchestrator) is
 * exercised by orchestrator.test.ts + jobs/registry.test.ts. Here we
 * mock the orchestrator + job registry to no-ops.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __existsSync = vi.fn();
const __readFileSync = vi.fn();
const __writeFileSync = vi.fn();
const __mkdirSync = vi.fn();
const __mockFiles = new Map<string, string>();

vi.mock('node:fs', () => ({
  default: {
    existsSync: __existsSync,
    readFileSync: __readFileSync,
    writeFileSync: __writeFileSync,
    mkdirSync: __mkdirSync,
  },
  existsSync: __existsSync,
  readFileSync: __readFileSync,
  writeFileSync: __writeFileSync,
  mkdirSync: __mkdirSync,
}));

vi.mock('./user-context', () => ({
  currentUserIdOrDefault: () => 'test-user-1',
  listSchedulableUsers: vi.fn(() => Promise.resolve(['test-user-1'])),
  runAsUser: vi.fn(async (_uid: string, fn: () => unknown) => fn()),
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000000',
}));

vi.mock('./profile-paths', () => ({
  userSharedPathForUser: (uid: string, kind: string) => `/test/users/${uid}/${kind}.json`,
}));

vi.mock('./events', () => ({
  installBusListener: vi.fn(),
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

vi.mock('./orchestrator', () => ({
  listRunning: vi.fn(() => []),
  runScan: vi.fn(),
  runGemini: vi.fn(),
  runLinkedInApply: vi.fn(),
  runAutoEval: vi.fn(() => Promise.resolve()),
}));

vi.mock('./jobs', () => ({
  get: vi.fn(() => undefined),
  runById: vi.fn(),
  list: vi.fn(() => []),
  isRunning: vi.fn(() => false),
}));

vi.mock('./job-last-run', () => ({
  readLastRun: vi.fn(() => null),
  writeLastRun: vi.fn(),
}));

beforeEach(() => {
  __existsSync.mockReset();
  __readFileSync.mockReset();
  __writeFileSync.mockReset();
  __mkdirSync.mockReset();
  __mockFiles.clear();
  __existsSync.mockImplementation((p: string) => __mockFiles.has(p));
  __readFileSync.mockImplementation((p: string) => {
    if (__mockFiles.has(p)) return __mockFiles.get(p)!;
    throw new Error('ENOENT: ' + p);
  });
  __writeFileSync.mockImplementation((p: string, body: string | Buffer) => {
    __mockFiles.set(p, typeof body === 'string' ? body : body.toString());
  });
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readConfig / readConfigForUser', () => {
  it('returns DEFAULT_CONFIG + writes it to disk when no config file exists', async () => {
    const { readConfig } = await import('./autopilot');
    const cfg = readConfig();
    expect(cfg.globalEnabled).toBe(false);
    expect(Array.isArray(cfg.schedules)).toBe(true);
    expect(cfg.schedules.length).toBeGreaterThan(0);
    // Should have written the default to disk.
    expect(__writeFileSync).toHaveBeenCalled();
  });

  it('reads + merges existing JSON config', async () => {
    const customJson = JSON.stringify({
      globalEnabled: true,
      schedules: [{ id: 'daily-scan', enabled: true }],
    });
    __mockFiles.set('/test/users/test-user-1/autopilot.json', customJson);
    const { readConfig } = await import('./autopilot');
    const cfg = readConfig();
    expect(cfg.globalEnabled).toBe(true);
    const scan = cfg.schedules.find((s) => s.id === 'daily-scan');
    expect(scan?.enabled).toBe(true);
  });

  it('falls back to defaults when JSON.parse throws', async () => {
    __mockFiles.set('/test/users/test-user-1/autopilot.json', 'not-json{');
    const { readConfig } = await import('./autopilot');
    const cfg = readConfig();
    expect(cfg).toBeTruthy();
    expect(cfg.globalEnabled).toBe(false);
  });

  it('readConfigForUser uses the explicit userId', async () => {
    const { readConfigForUser } = await import('./autopilot');
    const cfg = readConfigForUser('other-user');
    expect(cfg).toBeTruthy();
    // The default-write should target the other-user path.
    const writes = __writeFileSync.mock.calls.map((c) => c[0]);
    expect(writes.some((w: string) => w.includes('other-user'))).toBe(true);
  });

  it('cache: second read returns the same in-memory value without fs.readFileSync', async () => {
    const { readConfig } = await import('./autopilot');
    readConfig();
    __readFileSync.mockClear();
    readConfig();
    expect(__readFileSync).not.toHaveBeenCalled();
  });
});

describe('writeConfig / writeConfigForUser', () => {
  it('persists the config to the user-shared path', async () => {
    const { writeConfig, readConfig } = await import('./autopilot');
    const cfg = readConfig();
    writeConfig({ ...cfg, globalEnabled: true });
    expect(__writeFileSync).toHaveBeenCalled();
    const lastWrite = __writeFileSync.mock.calls.slice(-1)[0];
    const body = lastWrite[1] as string;
    const parsed = JSON.parse(body);
    expect(parsed.globalEnabled).toBe(true);
  });

  it('writes JSON formatted with 2-space indent + trailing newline', async () => {
    const { writeConfig, readConfig } = await import('./autopilot');
    writeConfig({ ...readConfig(), globalEnabled: true });
    const lastWrite = __writeFileSync.mock.calls.slice(-1)[0];
    const body = lastWrite[1] as string;
    expect(body).toMatch(/\n$/);
    expect(body).toContain('  '); // 2-space indent
  });

  it('updates the cache after write', async () => {
    const { writeConfig, readConfig } = await import('./autopilot');
    const cfg = readConfig();
    writeConfig({ ...cfg, globalEnabled: true });
    __readFileSync.mockClear();
    const after = readConfig();
    expect(after.globalEnabled).toBe(true);
    expect(__readFileSync).not.toHaveBeenCalled();
  });
});

describe('patchConfig / patchConfigForUser', () => {
  it('shallow-merges top-level fields', async () => {
    const { patchConfig, readConfig } = await import('./autopilot');
    readConfig(); // seed defaults
    const patched = patchConfig({ globalEnabled: true });
    expect(patched.globalEnabled).toBe(true);
    expect(patched.schedules.length).toBeGreaterThan(0); // preserved
  });

  it('deep-merges thresholds', async () => {
    const { patchConfig, readConfig } = await import('./autopilot');
    readConfig();
    const patched = patchConfig({
      thresholds: { autoEvaluateScore: 4.9 } as never,
    });
    expect(patched.thresholds.autoEvaluateScore).toBe(4.9);
    // Other thresholds preserved.
    expect(patched.thresholds.maxAppliesPerDay).toBeGreaterThan(0);
  });

  it('replaces schedules array when patch.schedules provided', async () => {
    const { patchConfig, readConfig } = await import('./autopilot');
    const cur = readConfig();
    const oneSchedule = [{ ...cur.schedules[0], enabled: true }];
    const patched = patchConfig({ schedules: oneSchedule });
    expect(patched.schedules.find((s) => s.id === cur.schedules[0].id)?.enabled).toBe(true);
  });
});

describe('nextRunAt', () => {
  it('returns null for a disabled schedule', async () => {
    const { nextRunAt } = await import('./autopilot');
    const result = nextRunAt({
      id: 'x',
      name: 'x',
      description: '',
      details: [],
      taskLabel: '',
      task: 'scan',
      enabled: false,
      trigger: { type: 'daily', hour: 9, minute: 0, weekdays: [] },
    });
    expect(result).toBeNull();
  });

  it('returns a future timestamp for a daily schedule', async () => {
    const { nextRunAt } = await import('./autopilot');
    const result = nextRunAt({
      id: 'x',
      name: 'x',
      description: '',
      details: [],
      taskLabel: '',
      task: 'scan',
      enabled: true,
      trigger: { type: 'daily', hour: 9, minute: 0, weekdays: [] },
    });
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(Date.now());
  });

  it('respects weekdays filter (only fires on listed days)', async () => {
    const { nextRunAt } = await import('./autopilot');
    const result = nextRunAt({
      id: 'x',
      name: 'x',
      description: '',
      details: [],
      taskLabel: '',
      task: 'scan',
      enabled: true,
      // Weekdays only -- Mon..Fri.
      trigger: { type: 'daily', hour: 9, minute: 0, weekdays: [1, 2, 3, 4, 5] },
    });
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDay()).toBeGreaterThanOrEqual(1);
    expect(date.getDay()).toBeLessThanOrEqual(5);
  });

  it('returns a future timestamp for weekly schedule', async () => {
    const { nextRunAt } = await import('./autopilot');
    const result = nextRunAt({
      id: 'x',
      name: 'x',
      description: '',
      details: [],
      taskLabel: '',
      task: 'scan',
      enabled: true,
      trigger: { type: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 },
    });
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDay()).toBe(1); // Monday
  });

  it('returns null for "after" triggers (they only fire on event)', async () => {
    const { nextRunAt } = await import('./autopilot');
    const result = nextRunAt({
      id: 'x',
      name: 'x',
      description: '',
      details: [],
      taskLabel: '',
      task: 'gemini',
      enabled: true,
      trigger: { type: 'after', task: 'scan' },
    });
    expect(result).toBeNull();
  });
});

describe('runScheduleNow', () => {
  it('returns ok:false for unknown schedule id', async () => {
    const { runScheduleNow } = await import('./autopilot');
    const r = runScheduleNow('definitely-not-a-real-schedule');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Unknown schedule');
  });

  it('rejects "after"-triggered schedules (no manual fire path)', async () => {
    const { patchConfig, runScheduleNow, readConfig } = await import('./autopilot');
    readConfig();
    // Find an existing after-triggered schedule.
    const cfg = readConfig();
    const afterSched = cfg.schedules.find((s) => s.trigger.type === 'after');
    if (afterSched) {
      patchConfig({ schedules: [{ ...afterSched, enabled: true }] });
      const r = runScheduleNow(afterSched.id);
      expect(r.ok).toBe(false);
      expect(r.message).toContain('only when its trigger event fires');
    }
  });

  it('fires the schedule when id matches a daily-trigger schedule', async () => {
    const { patchConfig, runScheduleNow, readConfig } = await import('./autopilot');
    readConfig();
    const cfg = readConfig();
    const dailySched = cfg.schedules.find((s) => s.trigger.type === 'daily');
    if (dailySched) {
      patchConfig({ schedules: [{ ...dailySched, enabled: true }] });
      const r = runScheduleNow(dailySched.id);
      expect(r.ok).toBe(true);
      expect(r.message).toContain('Triggered');
    }
  });
});
