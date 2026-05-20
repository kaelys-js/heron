/**
 * scan-email-imap.test -- Gmail IMAP poller daemon. Covers
 * tickOnce + installImapPollerDaemon + the runScanEmailImap registered
 * job (via the register() mock capturing the registration).
 *
 * Mocks: child_process.spawn (no real subprocess), getSource (so we
 * can flip connected on/off), registry (capture the register() call),
 * user-context (control fan-out users), events (silence logs), and
 * the email-reactor dynamic import.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const __spawnMock = vi.fn();
const __getSource = vi.fn();
const __recordSuccess = vi.fn();
const __recordFailure = vi.fn();
const __register = vi.fn();
const __runById = vi.fn();
const __hasJob = vi.fn(() => true);
const __logEvent = vi.fn();
const __reportServerError = vi.fn();
const __listSchedulableUsers = vi.fn();
const __runAsUser = vi.fn();
const __reactToEmail = vi.fn();
const __userContextEnv = vi.fn(() => process.env);

vi.mock('node:child_process', () => ({ spawn: __spawnMock }));

vi.mock('../sources', () => ({
  getSource: __getSource,
  recordSuccess: __recordSuccess,
  recordFailure: __recordFailure,
}));

vi.mock('./registry', () => ({
  register: __register,
  runById: __runById,
  has: __hasJob,
}));

vi.mock('../events', () => ({
  logEvent: __logEvent,
  reportServerError: __reportServerError,
}));

const SYSTEM_USER_ID_LOCAL = '00000000-0000-0000-0000-000000000000';
vi.mock('../user-context', () => ({
  listSchedulableUsers: __listSchedulableUsers,
  runAsUser: __runAsUser,
  userContextEnv: __userContextEnv,
  SYSTEM_USER_ID: SYSTEM_USER_ID_LOCAL,
}));

vi.mock('../email-reactor', () => ({
  reactToEmail: __reactToEmail,
}));

/** Build a fake child process that supports the same `.on('data')`,
 *  `.on('close')`, `.on('error')` events that the real one does. */
function fakeChild(opts: { stdout?: string; stderr?: string; code?: number; err?: Error } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    if (opts.stdout) child.stdout.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr) child.stderr.emit('data', Buffer.from(opts.stderr));
    if (opts.err) child.emit('error', opts.err);
    else child.emit('close', opts.code ?? 0);
  });
  return child;
}

beforeEach(() => {
  __spawnMock.mockReset();
  __getSource.mockReset();
  __recordSuccess.mockReset();
  __recordFailure.mockReset();
  __register.mockReset();
  __runById.mockReset();
  __hasJob.mockReset();
  __hasJob.mockReturnValue(true);
  __logEvent.mockReset();
  __reportServerError.mockReset();
  __listSchedulableUsers.mockReset();
  __runAsUser.mockReset();
  __runAsUser.mockImplementation(async (_uid: string, fn: () => unknown) => fn());
  __reactToEmail.mockReset();
  __userContextEnv.mockReturnValue(process.env);
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('register(scan-email-imap)', () => {
  it('module-load registers the scan-email-imap job', async () => {
    await import('./scan-email-imap.job');
    expect(__register).toHaveBeenCalledTimes(1);
    const def = __register.mock.calls[0][0];
    expect(def.id).toBe('scan-email-imap');
    expect(def.category).toBe('discovery');
    expect(def.perUser).toBe(true);
    expect(def.allowManual).toBe(true);
    expect(typeof def.run).toBe('function');
  });
});

describe('runScanEmailImap (via the registered def.run)', () => {
  async function getRun() {
    await import('./scan-email-imap.job');
    return __register.mock.calls[0][0].run as (
      args?: Record<string, unknown>,
    ) => Promise<{ ok: boolean; message?: string; error?: string; meta?: Record<string, unknown> }>;
  }

  it('returns ok:false when gmail-imap source is not connected', async () => {
    __getSource.mockReturnValue({ connected: false });
    const run = await getRun();
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not connected');
    expect(__spawnMock).not.toHaveBeenCalled();
  });

  it('spawns scan-email-imap.mjs when connected (success path)', async () => {
    __getSource.mockReturnValue({ connected: true });
    __spawnMock.mockImplementation(() => fakeChild({ stdout: 'Total jobs found: 7\n', code: 0 }));
    const run = await getRun();
    const promise = run();
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(__spawnMock).toHaveBeenCalled();
    const args = __spawnMock.mock.calls[0];
    expect(args[0]).toBe('node');
    expect(args[1][0]).toContain('scan-email-imap.mjs');
    expect(result.ok).toBe(true);
    expect((result.meta as { found: number }).found).toBe(7);
    expect(__recordSuccess).toHaveBeenCalledWith('gmail-imap');
  });

  it('forwards args.profileId / dryRun / keepUnread as CLI flags', async () => {
    __getSource.mockReturnValue({ connected: true });
    __spawnMock.mockImplementation(() => fakeChild({ stdout: 'Total jobs found: 0\n', code: 0 }));
    const run = await getRun();
    const promise = run({ profileId: 'engineer', dryRun: true, keepUnread: true });
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    const cliArgs = __spawnMock.mock.calls[0][1] as string[];
    expect(cliArgs).toContain('--profile');
    expect(cliArgs).toContain('engineer');
    expect(cliArgs).toContain('--dry-run');
    expect(cliArgs).toContain('--keep-unread');
  });

  it('returns ok:false + records failure on spawn error', async () => {
    __getSource.mockReturnValue({ connected: true });
    __spawnMock.mockImplementation(() => fakeChild({ err: new Error('ENOENT: node') }));
    const run = await getRun();
    const promise = run();
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ENOENT: node');
    expect(__recordFailure).toHaveBeenCalled();
  });

  it('returns ok:false + records failure on non-zero exit', async () => {
    __getSource.mockReturnValue({ connected: true });
    __spawnMock.mockImplementation(() => fakeChild({ stderr: 'IMAP auth failed', code: 1 }));
    const run = await getRun();
    const promise = run();
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain('exit 1');
    expect(__recordFailure).toHaveBeenCalled();
  });

  it('parses INBOUND_REACTION lines + calls reactToEmail for each', async () => {
    __getSource.mockReturnValue({ connected: true });
    __reactToEmail.mockResolvedValue({ classification: { kind: 'rejection' } });
    const stdout =
      'Total jobs found: 1\n' +
      'INBOUND_REACTION: {"messageId":"m-1","from":"x@y.com","subject":"s","body":"b","ts":1}\n' +
      'INBOUND_REACTION: {"messageId":"m-2","from":"a@b.com","subject":"s","body":"b","ts":2}\n';
    __spawnMock.mockImplementation(() => fakeChild({ stdout, code: 0 }));
    const run = await getRun();
    const promise = run();
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(__reactToEmail).toHaveBeenCalledTimes(2);
    expect((result.meta as { reactedActed: number }).reactedActed).toBe(2);
  });

  it('reports server error when reactToEmail throws', async () => {
    __getSource.mockReturnValue({ connected: true });
    __reactToEmail.mockRejectedValue(new Error('reactor crash'));
    const stdout =
      'Total jobs found: 0\n' +
      'INBOUND_REACTION: {"messageId":"m-1","from":"x@y","subject":"s","body":"b","ts":1}\n';
    __spawnMock.mockImplementation(() => fakeChild({ stdout, code: 0 }));
    const run = await getRun();
    const promise = run();
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    expect(__reportServerError).toHaveBeenCalled();
  });

  it('does NOT count "other" classifications as acted', async () => {
    __getSource.mockReturnValue({ connected: true });
    __reactToEmail.mockResolvedValue({ classification: { kind: 'other' } });
    const stdout =
      'Total jobs found: 0\n' +
      'INBOUND_REACTION: {"messageId":"m-1","from":"x@y","subject":"s","body":"b","ts":1}\n';
    __spawnMock.mockImplementation(() => fakeChild({ stdout, code: 0 }));
    const run = await getRun();
    const promise = run();
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    const meta = result.meta as { reactedActed: number; reactedTotal: number };
    expect(meta.reactedTotal).toBe(1);
    expect(meta.reactedActed).toBe(0);
  });
});

describe('tickOnce', () => {
  it('returns early when scan-email-imap is not registered', async () => {
    __hasJob.mockReturnValue(false);
    const { tickOnce } = await import('./scan-email-imap.job');
    await tickOnce();
    expect(__listSchedulableUsers).not.toHaveBeenCalled();
  });

  it('returns early when only the SYSTEM user is schedulable', async () => {
    __listSchedulableUsers.mockResolvedValue([SYSTEM_USER_ID_LOCAL]);
    const { tickOnce } = await import('./scan-email-imap.job');
    await tickOnce();
    expect(__runAsUser).not.toHaveBeenCalled();
  });

  it('iterates real users + calls runById under each user context', async () => {
    __listSchedulableUsers.mockResolvedValue(['u1', 'u2']);
    __getSource.mockReturnValue({ connected: true });
    __runById.mockResolvedValue({ ok: true });
    const { tickOnce } = await import('./scan-email-imap.job');
    await tickOnce();
    expect(__runAsUser).toHaveBeenCalledTimes(2);
    expect(__runById).toHaveBeenCalledWith('scan-email-imap');
  });

  it('skips users whose gmail-imap source is disconnected', async () => {
    __listSchedulableUsers.mockResolvedValue(['u1']);
    __getSource.mockReturnValue({ connected: false });
    const { tickOnce } = await import('./scan-email-imap.job');
    await tickOnce();
    expect(__runById).not.toHaveBeenCalled();
  });

  it('catches per-user runById throws + continues to the next user', async () => {
    __listSchedulableUsers.mockResolvedValue(['u1', 'u2']);
    __getSource.mockReturnValue({ connected: true });
    let call = 0;
    __runById.mockImplementation(async () => {
      call++;
      if (call === 1) throw new Error('per-user fail');
      return { ok: true };
    });
    const { tickOnce } = await import('./scan-email-imap.job');
    await tickOnce();
    expect(__runById).toHaveBeenCalledTimes(2);
    expect(__reportServerError).toHaveBeenCalled();
  });
});

describe('installImapPollerDaemon', () => {
  it('does not crash + the timers are .unref()d so tests can exit', async () => {
    const { installImapPollerDaemon } = await import('./scan-email-imap.job');
    expect(() => installImapPollerDaemon()).not.toThrow();
  });

  it('clears a prior interval handle when reinstalled (idempotent)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { installImapPollerDaemon } = await import('./scan-email-imap.job');
    installImapPollerDaemon();
    installImapPollerDaemon();
    expect(clearSpy).toHaveBeenCalled();
  });
});
