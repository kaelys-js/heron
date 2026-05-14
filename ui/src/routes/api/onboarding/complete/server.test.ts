/**
 * POST /api/onboarding/complete — flip the completed flag, fire seed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const spawnCalls: { bin: string; args: string[] }[] = [];

vi.mock('node:child_process', () => ({
  spawn: vi.fn((bin: string, args: string[]) => {
    spawnCalls.push({ bin, args });
    const p = new EventEmitter() as EventEmitter & { unref: () => void };
    p.unref = () => undefined;
    return p;
  }),
}));

let markCompleteResult = { completedSteps: ['welcome', 'cv'], completed: true };
const markCompleteCalls: number[] = [];
vi.mock('$lib/server/onboarding', () => ({
  markComplete: () => {
    markCompleteCalls.push(Date.now());
    return markCompleteResult;
  },
}));

vi.mock('$lib/server/profiles', () => ({
  getActiveProfileId: () => 'default',
}));

vi.mock('$lib/server/files', () => ({ ROOT: '/tmp/repo' }));

const swapCalls: string[] = [];
vi.mock('$lib/server/profile-symlinks', () => ({
  swapProfileSymlinks: (id: string) => {
    swapCalls.push(id);
  },
}));

vi.mock('$lib/config/branding', () => ({
  CLI_NAMESPACE: 'career-ops',
}));

vi.mock('$lib/config/cli', () => ({
  AGENT_CLI: 'claude',
}));

const loggedEvents: { source: string; msg: string; meta: unknown }[] = [];
vi.mock('$lib/server/events', () => ({
  logEvent: (source: string, msg: string, meta: unknown) => {
    loggedEvents.push({ source, msg, meta });
  },
  reportServerError: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  spawnCalls.length = 0;
  markCompleteCalls.length = 0;
  swapCalls.length = 0;
  loggedEvents.length = 0;
  markCompleteResult = { completedSteps: ['welcome', 'cv'], completed: true };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/onboarding/complete'),
    request: new Request('http://localhost/api/onboarding/complete', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('POST /api/onboarding/complete', () => {
  it('marks onboarding complete (default body)', async () => {
    const r = await post({});
    expect(r.status).toBe(200);
    expect(markCompleteCalls.length).toBe(1);
  });

  it('returns the new state from markComplete', async () => {
    const r = await post({});
    expect(r.body.state.completed).toBe(true);
    expect(r.body.state.completedSteps.length).toBe(2);
  });

  it('fires the seed-form-answers spawn on normal-completion path', async () => {
    await post({});
    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0].bin).toBe('claude');
    expect(spawnCalls[0].args[0]).toBe('-p');
    expect(spawnCalls[0].args[1]).toContain('/career-ops seed-form-answers');
    expect(spawnCalls[0].args).toContain('--dangerously-skip-permissions');
  });

  it('swaps profile symlinks BEFORE firing the seed', async () => {
    await post({});
    expect(swapCalls).toEqual(['default']);
  });

  it('SKIP path does NOT fire the seed spawn', async () => {
    await post({ skip: true });
    expect(spawnCalls.length).toBe(0);
    expect(swapCalls.length).toBe(0);
  });

  it('SKIP path still marks onboarding complete', async () => {
    await post({ skip: true });
    expect(markCompleteCalls.length).toBe(1);
  });

  it('emits a success-level "Onboarding complete" log when not skipped', async () => {
    await post({});
    const evt = loggedEvents.find((e) => e.msg === 'Onboarding complete');
    expect(evt).toBeTruthy();
    expect((evt!.meta as { level: string }).level).toBe('success');
  });

  it('emits an info-level "Onboarding skipped (advanced)" log when skipped', async () => {
    await post({ skip: true });
    const evt = loggedEvents.find((e) => e.msg === 'Onboarding skipped (advanced)');
    expect(evt).toBeTruthy();
    expect((evt!.meta as { level: string }).level).toBe('info');
  });

  it('tolerates malformed JSON body (treats as {})', async () => {
    const r = await post('not-json');
    expect(r.status).toBe(200);
    // Default → no skip → seed fires
    expect(spawnCalls.length).toBe(1);
  });
});
