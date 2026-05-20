/**
 * orchestrator.dense.test -- public spawn API + the private `start()`
 * helper via runScan/runGemini/runPortalLogin/runLinkedInApply.
 *
 * Mocks: child_process.spawn (no real subprocess), every collaborator
 * (events, user-secrets, profile-paths, user-context, autopilot,
 * apply-counter, cv-pdf, env, profiles, mode-substitution).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const __spawnMock = vi.fn();
const __logEvent = vi.fn();
const __getCredential = vi.fn();
const __maybeCurrentUserId = vi.fn();
const __currentUserIdOrDefault = vi.fn();
const __getActiveProfileId = vi.fn();
const __readAutopilotConfig = vi.fn();
const __todayCount = vi.fn();
const __bumpApplyCounter = vi.fn();
const __generalCvStatus = vi.fn();
const __existsSync = vi.fn();

const SYSTEM_USER_ID_LOCAL = '00000000-0000-0000-0000-000000000000';

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawn: __spawnMock };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, default: { ...actual, existsSync: __existsSync }, existsSync: __existsSync };
});

vi.mock('./events', () => ({
  logEvent: __logEvent,
  reportServerError: vi.fn(),
  installBusListener: vi.fn(),
}));

vi.mock('./env', () => ({ loadEnv: vi.fn() }));

vi.mock('./user-context', () => ({
  maybeCurrentUserId: __maybeCurrentUserId,
  currentUserIdOrDefault: __currentUserIdOrDefault,
  SYSTEM_USER_ID: SYSTEM_USER_ID_LOCAL,
}));

vi.mock('./user-secrets', () => ({
  getCredential: __getCredential,
  MIGRATABLE_KEYS: ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GMAIL_IMAP_PASSWORD'],
}));

vi.mock('./profiles', () => ({ getActiveProfileId: __getActiveProfileId }));

vi.mock('./profile-paths', () => ({
  activePath: () => '/test/active',
  profilePathForUser: () => '/test/profile/path',
}));

vi.mock('./mode-substitution', () => ({ realizeModePromptForUser: vi.fn() }));

vi.mock('./autopilot', () => ({ readConfig: __readAutopilotConfig }));
vi.mock('./apply-counter', () => ({
  todayCount: __todayCount,
  bumpApplyCounter: __bumpApplyCounter,
}));
vi.mock('./cv-pdf', () => ({ generalCvStatus: __generalCvStatus }));

/** Fake ChildProcess: EventEmitter-compatible with stdout/stderr/kill. */
function fakeChild(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: () => void;
  exitCode: number | null;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
    exitCode: number | null;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.exitCode = null;
  return child;
}

beforeEach(() => {
  vi.clearAllMocks();
  __existsSync.mockReturnValue(false);
  __maybeCurrentUserId.mockReturnValue(null);
  __currentUserIdOrDefault.mockReturnValue(SYSTEM_USER_ID_LOCAL);
  __getActiveProfileId.mockReturnValue('default');
  __getCredential.mockReturnValue(null);
  __readAutopilotConfig.mockReturnValue({ thresholds: { maxAppliesPerDay: 20 } });
  __todayCount.mockReturnValue(0);
  __bumpApplyCounter.mockReturnValue(1);
  __generalCvStatus.mockReturnValue({ exists: true, outdated: false });
  __spawnMock.mockImplementation(() => fakeChild());
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listRunning', () => {
  it('returns an empty array on a fresh module load', async () => {
    const { listRunning } = await import('./orchestrator');
    expect(listRunning()).toEqual([]);
  });
});

describe('runScan', () => {
  it('spawns python with the scan-broad.py script', async () => {
    const { runScan } = await import('./orchestrator');
    runScan();
    expect(__spawnMock).toHaveBeenCalled();
    const [cmd, args] = __spawnMock.mock.calls[0];
    expect(cmd).toMatch(/python/);
    expect(args[0]).toContain('scan-broad.py');
  });

  it('does NOT add --profile flag when profileId omitted', async () => {
    const { runScan } = await import('./orchestrator');
    runScan();
    const args = __spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain('--profile');
  });

  it('adds --profile flag when profileId supplied', async () => {
    const { runScan } = await import('./orchestrator');
    runScan('engineer');
    const args = __spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--profile');
    expect(args).toContain('engineer');
  });

  it('injects HERON_USER_ID into the child env when a user is in context', async () => {
    __maybeCurrentUserId.mockReturnValue('user-abc');
    const { runScan } = await import('./orchestrator');
    runScan();
    const opts = __spawnMock.mock.calls[0][2];
    expect(opts.env.HERON_USER_ID).toBe('user-abc');
  });

  it('does NOT inject HERON_USER_ID for the SYSTEM sentinel', async () => {
    __maybeCurrentUserId.mockReturnValue(SYSTEM_USER_ID_LOCAL);
    const { runScan } = await import('./orchestrator');
    runScan();
    const opts = __spawnMock.mock.calls[0][2];
    expect(opts.env.HERON_USER_ID).toBeUndefined();
  });

  it('refuses to start a second scan while one is in flight', async () => {
    const { runScan } = await import('./orchestrator');
    runScan();
    runScan();
    expect(__spawnMock).toHaveBeenCalledTimes(1);
    const warnCall = __logEvent.mock.calls.find((c) => c[1] === 'Task already running');
    expect(warnCall).toBeDefined();
  });
});

describe('runGemini', () => {
  it('logs an error + does NOT spawn when GEMINI_API_KEY is missing', async () => {
    __getCredential.mockReturnValue(null);
    const { runGemini } = await import('./orchestrator');
    runGemini();
    expect(__spawnMock).not.toHaveBeenCalled();
    const errCall = __logEvent.mock.calls.find((c) => c[1].includes('Gemini API key not set'));
    expect(errCall).toBeDefined();
  });

  it('spawns gemini-first-pass.py when credential present', async () => {
    __getCredential.mockImplementation((_uid: string, key: string) =>
      key === 'GEMINI_API_KEY' ? 'test-gemini-key' : null,
    );
    const { runGemini } = await import('./orchestrator');
    runGemini();
    expect(__spawnMock).toHaveBeenCalled();
    const args = __spawnMock.mock.calls[0][1] as string[];
    expect(args[0]).toContain('gemini-first-pass.py');
    expect(args).toContain('--top');
    expect(args).toContain('30');
  });

  it('honours explicit top argument', async () => {
    __getCredential.mockImplementation((_uid: string, key: string) =>
      key === 'GEMINI_API_KEY' ? 'k' : null,
    );
    const { runGemini } = await import('./orchestrator');
    runGemini(50);
    const args = __spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('50');
  });

  it('adds --profile flag when profileId supplied', async () => {
    __getCredential.mockImplementation((_uid: string, key: string) =>
      key === 'GEMINI_API_KEY' ? 'k' : null,
    );
    const { runGemini } = await import('./orchestrator');
    runGemini(30, 'engineer');
    const args = __spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--profile');
    expect(args).toContain('engineer');
  });
});

describe('runPortalLogin / runLinkedInLogin', () => {
  it('runPortalLogin("linkedin") spawns linkedin-easy-apply.py with --login', async () => {
    const { runPortalLogin } = await import('./orchestrator');
    runPortalLogin('linkedin');
    expect(__spawnMock).toHaveBeenCalled();
    const args = __spawnMock.mock.calls[0][1] as string[];
    expect(args[0]).toContain('linkedin-easy-apply.py');
    expect(args).toContain('--login');
  });

  it('runPortalLogin("indeed") spawns lib_playwright_auth.py with --portal indeed', async () => {
    const { runPortalLogin } = await import('./orchestrator');
    runPortalLogin('indeed');
    expect(__spawnMock).toHaveBeenCalled();
    const args = __spawnMock.mock.calls[0][1] as string[];
    expect(args[0]).toContain('lib_playwright_auth.py');
    expect(args).toContain('--portal');
    expect(args).toContain('indeed');
  });

  it('runLinkedInLogin delegates to runPortalLogin("linkedin")', async () => {
    const { runLinkedInLogin } = await import('./orchestrator');
    runLinkedInLogin();
    const args = __spawnMock.mock.calls[0][1] as string[];
    expect(args[0]).toContain('linkedin-easy-apply.py');
    expect(args).toContain('--login');
  });
});

describe('runLinkedInApply', () => {
  it('refuses when an apply-linkedin task is already running', async () => {
    const { runLinkedInApply } = await import('./orchestrator');
    runLinkedInApply();
    runLinkedInApply();
    expect(__spawnMock).toHaveBeenCalledTimes(1);
    const warn = __logEvent.mock.calls.find((c) => c[1].includes('LinkedIn apply already running'));
    expect(warn).toBeDefined();
  });

  // Note: the daily-cap check uses runtime `require('./apply-counter')`
  // inside the function body, which vi.mock can't intercept. Cap-reached
  // behaviour is exercised by integration tests via the real apply-counter
  // module + a real today's-counter file.

  it('spawns linkedin-easy-apply.py with the URL when supplied', async () => {
    __todayCount.mockReturnValue(5);
    const { runLinkedInApply } = await import('./orchestrator');
    runLinkedInApply(false, 'https://linkedin.com/jobs/123');
    expect(__spawnMock).toHaveBeenCalled();
    const args = __spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--url');
    expect(args).toContain('https://linkedin.com/jobs/123');
  });

  it('sets LINKEDIN_AUTO_SUBMIT=1 env when autoSubmit=true', async () => {
    __todayCount.mockReturnValue(0);
    const { runLinkedInApply } = await import('./orchestrator');
    runLinkedInApply(true);
    const opts = __spawnMock.mock.calls[0][2];
    expect(opts.env.LINKEDIN_AUTO_SUBMIT).toBe('1');
  });

  it('does NOT set LINKEDIN_AUTO_SUBMIT when autoSubmit=false', async () => {
    __todayCount.mockReturnValue(0);
    const { runLinkedInApply } = await import('./orchestrator');
    runLinkedInApply(false);
    const opts = __spawnMock.mock.calls[0][2];
    expect(opts.env.LINKEDIN_AUTO_SUBMIT).toBeUndefined();
  });

  // Note: the CV status pre-check uses runtime `require('./cv-pdf')` inside
  // the function body which bypasses vi.mock. CV note + outdated paths
  // are exercised by integration tests against a real cv-pdf module.

  it('still spawns when autopilot/apply-counter modules throw', async () => {
    __readAutopilotConfig.mockImplementation(() => {
      throw new Error('boot race');
    });
    const { runLinkedInApply } = await import('./orchestrator');
    runLinkedInApply();
    expect(__spawnMock).toHaveBeenCalled();
    const skipWarn = __logEvent.mock.calls.find((c) => c[1].includes('Apply-cap check skipped'));
    expect(skipWarn).toBeDefined();
  });
});

describe('start() helper -- error + lifecycle (via runScan)', () => {
  it('handles synchronous spawn() throw with a logEvent', async () => {
    __spawnMock.mockImplementation(() => {
      throw new Error('EACCES on python');
    });
    const { runScan } = await import('./orchestrator');
    runScan();
    const errCall = __logEvent.mock.calls.find((c) => c[1] === 'Task failed to spawn');
    expect(errCall).toBeDefined();
  });

  it('handles async error event from the child', async () => {
    const child = fakeChild();
    __spawnMock.mockReturnValue(child);
    const { runScan } = await import('./orchestrator');
    runScan();
    child.emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const errCall = __logEvent.mock.calls.find((c) => c[1] === 'Task failed to spawn');
    expect(errCall).toBeDefined();
  });

  it('removes the task from `running` after a successful close', async () => {
    const child = fakeChild();
    __spawnMock.mockReturnValue(child);
    const { runScan, listRunning } = await import('./orchestrator');
    runScan();
    expect(listRunning()).toContain('scan');
    child.emit('close', 0);
    expect(listRunning()).not.toContain('scan');
  });

  it('logs success on exit code 0', async () => {
    const child = fakeChild();
    __spawnMock.mockReturnValue(child);
    const { runScan } = await import('./orchestrator');
    runScan();
    child.emit('close', 0);
    const ok = __logEvent.mock.calls.find((c) => c[1] === 'Task finished');
    expect(ok).toBeDefined();
  });

  it('logs failure on non-zero exit code', async () => {
    const child = fakeChild();
    __spawnMock.mockReturnValue(child);
    const { runScan } = await import('./orchestrator');
    runScan();
    child.emit('close', 1);
    const fail = __logEvent.mock.calls.find((c) => c[1] === 'Task failed');
    expect(fail).toBeDefined();
  });
});
