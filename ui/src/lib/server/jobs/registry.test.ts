/**
 * jobs/registry.test -- pluggable job registry: register / get / has /
 * list / listSummaries / runById (single + perUser fan-out + error
 * branches) / isRunning / installAfterListener.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __installBusListener = vi.fn();
const __logEvent = vi.fn();
const __reportServerError = vi.fn();

vi.mock('../events', () => ({
  installBusListener: __installBusListener,
  logEvent: __logEvent,
  reportServerError: __reportServerError,
}));

const __maybeCurrentUserId = vi.fn();
const __runAsUser = vi.fn();
const __listSchedulableUsers = vi.fn();
const SYSTEM_USER_ID_LOCAL = '00000000-0000-0000-0000-000000000000';

vi.mock('../user-context', () => ({
  maybeCurrentUserId: __maybeCurrentUserId,
  runAsUser: __runAsUser,
  listSchedulableUsers: __listSchedulableUsers,
  SYSTEM_USER_ID: SYSTEM_USER_ID_LOCAL,
}));

beforeEach(() => {
  __installBusListener.mockReset();
  __logEvent.mockReset();
  __reportServerError.mockReset();
  __maybeCurrentUserId.mockReset();
  __runAsUser.mockReset();
  __listSchedulableUsers.mockReset();
  // Default: simulate "no current user" so perUser jobs fan out.
  __maybeCurrentUserId.mockReturnValue(null);
  __runAsUser.mockImplementation(async (_uid: string, fn: () => unknown) => fn());
  __listSchedulableUsers.mockResolvedValue(['u1', 'u2']);
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// `as never` casts away the JobDef type narrowness on `category` --
// the field is a JobCategory union; tests just need a string.
function defaultJob(over: Record<string, unknown> = {}): never {
  return {
    id: 'test-job',
    label: 'Test job',
    description: 'A test job',
    category: 'discovery',
    trigger: { type: 'manual' as const },
    allowManual: true,
    perUser: false,
    run: vi.fn(async () => ({ ok: true, message: 'done' })),
    ...over,
  } as never;
}

describe('register / get / has', () => {
  it('register stores the job definition', async () => {
    const { register, get, has } = await import('./registry');
    const job = defaultJob();
    register(job);
    expect(get('test-job')).toBe(job);
    expect(has('test-job')).toBe(true);
  });

  it('get returns undefined for unknown id', async () => {
    const { get, has } = await import('./registry');
    expect(get('nope')).toBeUndefined();
    expect(has('nope')).toBe(false);
  });

  it('register is last-writer-wins (HMR-safe replacement)', async () => {
    const { register, get } = await import('./registry');
    const v1 = defaultJob({ label: 'v1' });
    const v2 = defaultJob({ label: 'v2' });
    register(v1);
    register(v2);
    expect(get('test-job')?.label).toBe('v2');
  });
});

describe('list / listSummaries', () => {
  it('list sorts by category then id', async () => {
    const { register, list } = await import('./registry');
    register(defaultJob({ id: 'b', category: 'apply' }));
    register(defaultJob({ id: 'a', category: 'discovery' }));
    register(defaultJob({ id: 'c', category: 'apply' }));
    const ids = list().map((j) => j.id);
    // 'apply' < 'discovery' alphabetically; within apply, b < c.
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('listSummaries omits the `run` function', async () => {
    const { register, listSummaries } = await import('./registry');
    register(defaultJob());
    const summaries = listSummaries();
    expect(summaries[0]).toHaveProperty('id');
    expect(summaries[0]).toHaveProperty('label');
    expect(summaries[0]).not.toHaveProperty('run');
  });
});

describe('runById -- basic', () => {
  it('returns error for unknown id', async () => {
    const { runById } = await import('./registry');
    const result = await runById('not-registered');
    expect(result.ok).toBe(false);
    expect((result as { error?: string }).error).toContain('Unknown job');
  });

  it('refuses to start a second concurrent run of the same id', async () => {
    const { register, runById } = await import('./registry');
    let resolveFirst!: () => void;
    const slowJob = defaultJob({
      id: 'slow',
      run: vi.fn(
        () =>
          new Promise<{ ok: boolean }>((resolve) => {
            resolveFirst = () => resolve({ ok: true });
          }),
      ),
    });
    register(slowJob);
    const first = runById('slow');
    const second = await runById('slow');
    expect(second.ok).toBe(false);
    expect((second as { error?: string }).error).toContain('already in flight');
    resolveFirst();
    await first;
  });

  it('catches throws + returns ok:false + reports the error', async () => {
    const { register, runById } = await import('./registry');
    register(
      defaultJob({
        id: 'throws',
        run: vi.fn(() => {
          throw new Error('boom');
        }),
      }),
    );
    const result = await runById('throws');
    expect(result.ok).toBe(false);
    expect((result as { error?: string }).error).toBe('boom');
    expect(__reportServerError).toHaveBeenCalled();
  });

  it('non-perUser jobs run once in the current scope', async () => {
    const { register, runById } = await import('./registry');
    const single = defaultJob({ id: 'single', perUser: false });
    register(single);
    await runById('single');
    expect((single as { run: { mock: { calls: unknown[] } } }).run.mock.calls.length).toBe(1);
    // No user fan-out should have happened.
    expect(__listSchedulableUsers).not.toHaveBeenCalled();
  });
});

describe('runById -- perUser fan-out', () => {
  it('iterates every schedulable user when no current user context', async () => {
    const { register, runById } = await import('./registry');
    const perUser = defaultJob({ id: 'fan', perUser: true });
    register(perUser);
    __maybeCurrentUserId.mockReturnValue(null);
    __listSchedulableUsers.mockResolvedValue(['u1', 'u2', 'u3']);
    const result = await runById('fan');
    expect(__listSchedulableUsers).toHaveBeenCalled();
    expect(__runAsUser).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
    expect((result as { message?: string }).message).toContain('3/3 users ok');
  });

  it('runs once under the current user when caller is already authenticated', async () => {
    const { register, runById } = await import('./registry');
    const perUser = defaultJob({ id: 'auth-fan', perUser: true });
    register(perUser);
    __maybeCurrentUserId.mockReturnValue('explicit-user');
    await runById('auth-fan');
    // No fan-out -- single direct run.
    expect(__listSchedulableUsers).not.toHaveBeenCalled();
    expect((perUser as { run: { mock: { calls: unknown[] } } }).run.mock.calls.length).toBe(1);
  });

  it('sYSTEM_USER_ID counts as "no user" -- fan-out still happens', async () => {
    const { register, runById } = await import('./registry');
    const perUser = defaultJob({ id: 'sys-fan', perUser: true });
    register(perUser);
    __maybeCurrentUserId.mockReturnValue(SYSTEM_USER_ID_LOCAL);
    __listSchedulableUsers.mockResolvedValue(['u1', 'u2']);
    await runById('sys-fan');
    expect(__listSchedulableUsers).toHaveBeenCalled();
    expect(__runAsUser).toHaveBeenCalledTimes(2);
  });

  it('aggregates failures across users (one bad credential does not stop others)', async () => {
    const { register, runById } = await import('./registry');
    const flaky = defaultJob({
      id: 'flaky',
      perUser: true,
      run: vi.fn(async () => ({ ok: false, error: 'user-specific failure' })),
    });
    register(flaky);
    __listSchedulableUsers.mockResolvedValue(['u1', 'u2']);
    const result = await runById('flaky');
    expect(result.ok).toBe(false);
    expect((result as { error?: string }).error).toContain('2 failed');
  });

  it('catches per-user throws + tags them in perUserResults', async () => {
    const { register, runById } = await import('./registry');
    let call = 0;
    const sometimesThrows = defaultJob({
      id: 'sometimes-throws',
      perUser: true,
      run: vi.fn(async () => {
        call++;
        if (call === 1) {
          throw new Error('per-user fail');
        }
        return { ok: true };
      }),
    });
    register(sometimesThrows);
    __listSchedulableUsers.mockResolvedValue(['u1', 'u2']);
    const result = await runById('sometimes-throws');
    expect(result.ok).toBe(false);
    const meta = result.meta as { perUser: Array<{ userId: string; result: { ok: boolean } }> };
    expect(meta.perUser).toHaveLength(2);
    expect(meta.perUser[0].result.ok).toBe(false);
    expect(meta.perUser[1].result.ok).toBe(true);
  });
});

describe('isRunning', () => {
  it('returns false when no run in progress', async () => {
    const { isRunning } = await import('./registry');
    expect(isRunning('whatever')).toBe(false);
  });

  it('returns true during a job invocation, false after', async () => {
    const { register, runById, isRunning } = await import('./registry');
    let resolver!: () => void;
    register(
      defaultJob({
        id: 'tick',
        run: vi.fn(
          () =>
            new Promise<{ ok: boolean }>((resolve) => {
              resolver = () => resolve({ ok: true });
            }),
        ),
      }),
    );
    const pending = runById('tick');
    expect(isRunning('tick')).toBe(true);
    resolver();
    await pending;
    expect(isRunning('tick')).toBe(false);
  });
});

describe('installAfterListener', () => {
  it('registers a bus listener under the "jobs/registry/after" name', async () => {
    const { installAfterListener } = await import('./registry');
    installAfterListener();
    expect(__installBusListener).toHaveBeenCalledTimes(1);
    expect(__installBusListener.mock.calls[0][0]).toBe('jobs/registry/after');
  });

  it('listener fires after-trigger jobs when a matching success event arrives', async () => {
    const { register, installAfterListener } = await import('./registry');
    const afterJob = defaultJob({
      id: 'after-scan',
      trigger: { type: 'after' as const, tasks: ['scan'] },
    });
    register(afterJob);
    installAfterListener();
    const listener = __installBusListener.mock.calls[0][1];
    listener({ level: 'success', source: 'scan', title: 'Scan finished' });
    expect(__logEvent).toHaveBeenCalled();
    expect(__logEvent.mock.calls[0][0]).toBe('after-scan');
  });

  it('listener IGNORES non-success events', async () => {
    const { register, installAfterListener } = await import('./registry');
    register(defaultJob({ id: 'after-x', trigger: { type: 'after', tasks: ['scan'] } }));
    installAfterListener();
    const listener = __installBusListener.mock.calls[0][1];
    listener({ level: 'error', source: 'scan', title: 'Scan failed' });
    expect(__logEvent).not.toHaveBeenCalled();
  });

  it('listener IGNORES its own "After-trigger from ..." events (no infinite chain)', async () => {
    const { register, installAfterListener } = await import('./registry');
    register(defaultJob({ id: 'after-x', trigger: { type: 'after', tasks: ['scan'] } }));
    installAfterListener();
    const listener = __installBusListener.mock.calls[0][1];
    listener({
      level: 'success',
      source: 'after-x',
      title: 'After-trigger from scan',
    });
    expect(__logEvent).not.toHaveBeenCalled();
  });

  it('listener IGNORES self-chaining (job triggers on its own success)', async () => {
    const { register, installAfterListener } = await import('./registry');
    register(defaultJob({ id: 'self', trigger: { type: 'after', tasks: ['self'] } }));
    installAfterListener();
    const listener = __installBusListener.mock.calls[0][1];
    listener({ level: 'success', source: 'self', title: 'finished' });
    expect(__logEvent).not.toHaveBeenCalled();
  });
});
