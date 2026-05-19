/**
 * scan-email-imap.job — daemon multi-user fan-out (F14/F19/F27 fix).
 *
 * Before: tickOnce() ran ONLY under the owner's context, polling the
 * owner's gmail-imap source. Every other user's mailbox was invisible
 * to the daemon — an explicit deferred-work note lived in the source.
 *
 * After: tickOnce() walks every schedulable user; for each, enters
 * their ALS context via runAsUser and polls their own gmail-imap
 * connection state. Errors are isolated per-user.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const USER_C = '33333333-3333-3333-3333-333333333333';
const SYSTEM_USER_ID = 'system-user';

// Mutable state the mocks read on each call so each test can configure
// who-is-connected + who-throws without re-importing the module.
const ctx: {
  connected: Record<string, boolean>;
  throwsOnRun: Set<string>;
  schedulable: string[];
  activeUser: string;
  runAsUserCalls: string[];
  runByIdCalls: { user: string; id: string }[];
  /** Optional delay (ms) inside runById to make serial-vs-parallel
   *  observable to the timeline trace. Set per-test. */
  delayMs: number;
  /** Timeline trace (start-X / end-X) for the serial-execution case. */
  trace: string[];
} = {
  connected: {},
  throwsOnRun: new Set(),
  schedulable: [SYSTEM_USER_ID, USER_A, USER_B, USER_C],
  activeUser: SYSTEM_USER_ID,
  runAsUserCalls: [],
  runByIdCalls: [],
  delayMs: 0,
  trace: [],
};

vi.mock('../user-context', () => ({
  SYSTEM_USER_ID,
  listSchedulableUsers: async () => ctx.schedulable,
  runAsUser: async (userId: string, fn: () => Promise<unknown> | unknown) => {
    ctx.runAsUserCalls.push(userId);
    const prev = ctx.activeUser;
    ctx.activeUser = userId;
    try {
      return await fn();
    } finally {
      ctx.activeUser = prev;
    }
  },
  userContextEnv: () => ({ ...process.env }),
  currentUserIdOrDefault: () => ctx.activeUser,
  maybeCurrentUserId: () => ctx.activeUser,
}));

vi.mock('../sources', () => ({
  getSource: (sourceId: string) => {
    if (sourceId !== 'gmail-imap') return { connected: false, consecutiveFailures: 0 };
    return { connected: !!ctx.connected[ctx.activeUser], consecutiveFailures: 0 };
  },
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock('./registry', () => ({
  register: vi.fn(),
  has: () => true,
  runById: async (id: string) => {
    const u = ctx.activeUser;
    ctx.runByIdCalls.push({ user: u, id });
    ctx.trace.push('start-' + u);
    if (ctx.delayMs > 0) {
      await new Promise((r) => setTimeout(r, ctx.delayMs));
    }
    ctx.trace.push('end-' + u);
    if (ctx.throwsOnRun.has(u)) {
      throw new Error(u + '-failed');
    }
    return { ok: true };
  },
}));

vi.mock('../events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

vi.mock('../files', () => ({ ROOT: '/tmp/heron-imap-job-test' }));

// Pull tickOnce as an export so we can drive it without fake timers.
const { tickOnce } = await import('./scan-email-imap.job');

beforeEach(() => {
  ctx.connected = {};
  ctx.throwsOnRun = new Set();
  ctx.schedulable = [SYSTEM_USER_ID, USER_A, USER_B, USER_C];
  ctx.activeUser = SYSTEM_USER_ID;
  ctx.runAsUserCalls.length = 0;
  ctx.runByIdCalls.length = 0;
  ctx.delayMs = 0;
  ctx.trace.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('scan-email-imap.job — daemon multi-user fan-out (F14/F19/F27)', () => {
  it('polls every user that has gmail-imap connected', async () => {
    ctx.connected = { [USER_A]: true, [USER_B]: true, [USER_C]: true };
    await tickOnce();
    // SYSTEM_USER_ID is filtered out by tickOnce.
    expect(ctx.runAsUserCalls.sort()).toEqual([USER_A, USER_B, USER_C].sort());
    expect(ctx.runByIdCalls.map((c) => c.user).sort()).toEqual([USER_A, USER_B, USER_C].sort());
    for (const c of ctx.runByIdCalls) expect(c.id).toBe('scan-email-imap');
  });

  it('skips users with gmail-imap disconnected', async () => {
    ctx.connected = { [USER_A]: true, [USER_B]: false, [USER_C]: true };
    await tickOnce();
    // runAsUser still entered for all 3 (we have to enter context to
    // read their sources.json), but runById only fired for connected.
    expect(ctx.runAsUserCalls.sort()).toEqual([USER_A, USER_B, USER_C].sort());
    expect(ctx.runByIdCalls.map((c) => c.user).sort()).toEqual([USER_A, USER_C].sort());
  });

  it('one user throwing does not stop the others', async () => {
    ctx.connected = { [USER_A]: true, [USER_B]: true, [USER_C]: true };
    ctx.throwsOnRun = new Set([USER_B]);
    await tickOnce();
    const polled = ctx.runByIdCalls.map((c) => c.user).sort();
    // All three were attempted; USER_B threw but USER_A and USER_C
    // completed normally.
    expect(polled).toEqual([USER_A, USER_B, USER_C].sort());
  });

  it('no real users → no polls (SYSTEM_USER alone is filtered)', async () => {
    ctx.schedulable = [SYSTEM_USER_ID];
    await tickOnce();
    expect(ctx.runByIdCalls).toEqual([]);
    expect(ctx.runAsUserCalls).toEqual([]);
  });

  it('runs polls serially, not in parallel (predictable resource use)', async () => {
    ctx.connected = { [USER_A]: true, [USER_B]: true, [USER_C]: true };
    ctx.delayMs = 5;
    // A small delay per user lets us prove serialization via the
    // start/end trace. If the fan-out were parallel, we'd see
    // [start-A, start-B, start-C, end-A, end-B, end-C]; serial
    // gives [start-A, end-A, start-B, end-B, start-C, end-C].
    await tickOnce();
    expect(ctx.trace.length).toBe(6); // 3 starts + 3 ends
    for (let i = 0; i < ctx.trace.length; i += 2) {
      const startUser = ctx.trace[i].replace('start-', '');
      const endUser = ctx.trace[i + 1].replace('end-', '');
      expect(startUser).toBe(endUser);
    }
  });
});
