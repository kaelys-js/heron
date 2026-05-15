/**
 * POST /api/onboarding/complete — flip the completed flag, fire seed.
 *
 * Post-Option-C: spawn pattern goes through spawnAgentWithMode() (not
 * the legacy slash-command path). Tests assert that helper is called
 * with the right mode name + profileId.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

interface SpawnAgentCall {
  modeName: string;
  userMessage: string;
  opts: { profileId: string; env?: Record<string, string> };
}
const spawnAgentCalls: SpawnAgentCall[] = [];

vi.mock('$lib/server/spawn-agent', () => ({
  spawnAgentWithMode: vi.fn(
    (modeName: string, userMessage: string, opts: SpawnAgentCall['opts']) => {
      spawnAgentCalls.push({ modeName, userMessage, opts });
      const p = new EventEmitter() as EventEmitter & { unref: () => void };
      p.unref = () => undefined;
      return { child: p, tempPromptPath: '/tmp/fake.md' };
    },
  ),
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

const loggedEvents: { source: string; msg: string; meta: unknown }[] = [];
vi.mock('$lib/server/events', () => ({
  logEvent: (source: string, msg: string, meta: unknown) => {
    loggedEvents.push({ source, msg, meta });
  },
  reportServerError: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  spawnAgentCalls.length = 0;
  markCompleteCalls.length = 0;
  loggedEvents.length = 0;
  markCompleteResult = { completedSteps: ['welcome', 'cv'], completed: true };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
  const req = new Request('http://localhost/api/onboarding/complete', init);
  const res = (await POST({ request: req } as unknown as Parameters<typeof POST>[0])) as Response;
  return { status: res.status, body: await res.json() };
}

describe('POST /api/onboarding/complete', () => {
  it('calls markComplete and returns 200', async () => {
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
    expect(spawnAgentCalls.length).toBe(1);
    expect(spawnAgentCalls[0].modeName).toBe('seed-form-answers');
    // seed-form-answers takes no user input; empty string passed.
    expect(spawnAgentCalls[0].userMessage).toBe('');
  });

  it('passes the active profileId to spawnAgentWithMode', async () => {
    await post({});
    expect(spawnAgentCalls[0].opts.profileId).toBe('default');
  });

  it('SKIP path does NOT fire the seed spawn', async () => {
    await post({ skip: true });
    expect(spawnAgentCalls.length).toBe(0);
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
    expect(spawnAgentCalls.length).toBe(1);
  });
});
