/**
 * events.test -- the activity event bus + log routing module.
 *
 * Covers: logEvent / reportServerError / installBusListener / bus.recent
 * / bus.recentForUser / bus.clear / burst guard / reentrancy guard /
 * userId tagging.
 *
 * Does NOT cover: fs append path (mocked to no-op so tests don't write
 * to the real `data/activity.jsonl`) -- the success path of
 * appendFileSync is exercised implicitly via the call assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

// ── fs mock ──────────────────────────────────────────────────────────
// Spy on writes so emitEvent's appendToDisk doesn't pollute the real
// activity.jsonl. We let reads pass through so the bus's loadFromDisk()
// at module init reflects the real on-disk state (typically empty in CI).
vi.spyOn(fs, 'appendFileSync').mockImplementation(() => undefined);
vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

// Mock user-context so tests don't depend on AsyncLocalStorage state.
let __currentUserId: string | null = null;
const SYSTEM_USER_ID_LOCAL = '00000000-0000-0000-0000-000000000000';
vi.mock('./user-context', () => ({
  SYSTEM_USER_ID: SYSTEM_USER_ID_LOCAL,
  maybeCurrentUserId: () => __currentUserId,
}));

// Mock db-writers so the dbWriteActivity require doesn't try to open
// app.db (which would race with real test runs).
vi.mock('./db-writers', () => ({
  dbWriteActivity: vi.fn(),
}));

const events = await import('./events');
const { bus, logEvent, reportServerError, installBusListener } = events;

beforeEach(() => {
  __currentUserId = null;
  bus.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('logEvent', () => {
  it('returns an ActivityEvent with required fields', () => {
    const ev = logEvent('test-source', 'Test event');
    expect(ev.id).toBeTruthy();
    expect(ev.ts).toBeTypeOf('number');
    expect(ev.source).toBe('test-source');
    expect(ev.title).toBe('Test event');
    expect(ev.level).toBe('info'); // default
    expect(ev.category).toBe('system'); // default
  });

  it('honours explicit level / category / message / link / stack', () => {
    const ev = logEvent('s', 't', {
      level: 'error',
      category: 'user',
      message: 'something failed',
      link: '/inbox',
      stack: 'Error at line 1',
    });
    expect(ev.level).toBe('error');
    expect(ev.category).toBe('user');
    expect(ev.message).toBe('something failed');
    expect(ev.link).toBe('/inbox');
    expect(ev.stack).toBe('Error at line 1');
  });

  it('threads an explicit kind onto the event (read by bell-gating)', () => {
    // WHY: a product-domain event emitted on the system category needs an
    // explicit kind to route loud -- eventKind() would otherwise derive
    // technical from the category. logEvent must carry the override through.
    const ev = logEvent('s', 't', { category: 'system', kind: 'product' });
    expect(ev.kind).toBe('product');
  });

  it('leaves kind undefined when not provided (eventKind derives it)', () => {
    const ev = logEvent('s', 't');
    expect(ev.kind).toBeUndefined();
  });

  it('tags userId from AsyncLocalStorage when no explicit override', () => {
    __currentUserId = '11111111-1111-1111-1111-111111111111';
    const ev = logEvent('s', 't');
    expect(ev.userId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('omits userId when AsyncLocalStorage returns SYSTEM_USER_ID', () => {
    __currentUserId = SYSTEM_USER_ID_LOCAL;
    const ev = logEvent('s', 't');
    expect(ev.userId).toBeUndefined();
  });

  it('explicit userId option overrides AsyncLocalStorage', () => {
    __currentUserId = 'als-uid';
    const ev = logEvent('s', 't', { userId: 'explicit-uid' });
    expect(ev.userId).toBe('explicit-uid');
  });

  it('userId: null emits a broadcast event (no userId tag)', () => {
    __currentUserId = 'als-uid';
    const ev = logEvent('s', 't', { userId: null });
    expect(ev.userId).toBeUndefined();
  });

  it('omits userId when none resolves at all', () => {
    __currentUserId = null;
    const ev = logEvent('s', 't');
    expect(ev.userId).toBeUndefined();
  });

  it('tags profileId when provided', () => {
    const ev = logEvent('s', 't', { profileId: 'default' });
    expect(ev.profileId).toBe('default');
  });

  it('carries an explicit requestId through to the event + the persisted JSONL line', () => {
    // WHY: this is the correlation thread. A client error POSTs the ORIGINAL
    // request's X-Request-Id; if logEvent drops it, support's on-screen "ref" can
    // never be grepped out of activity.jsonl. The id must land on the event object
    // AND in the serialized disk line.
    const ev = logEvent('s', 't', { requestId: 'req-correlate-1' });
    expect(ev.requestId).toBe('req-correlate-1');
    const args = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls.slice(-1)[0];
    expect(String(args[1])).toContain('req-correlate-1');
  });

  it('omits requestId when none is supplied (no empty field churn)', () => {
    const ev = logEvent('s', 't');
    expect(ev.requestId).toBeUndefined();
  });

  it('fingerprints error/warn events for grouping, but not info/success', () => {
    const err = logEvent('db', 'connection lost', {
      level: 'error',
      stack: 'E\n at f (~/a.ts:1:2)',
    });
    expect(err.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(logEvent('s', 'just info').fingerprint).toBeUndefined();
  });

  it('persists the event in the bus buffer', () => {
    const ev = logEvent('persist-test', 'persisted');
    expect(bus.recent().some((e) => e.id === ev.id)).toBe(true);
  });

  it('calls fs.appendFileSync with the serialized event', () => {
    logEvent('append-test', 'appended');
    expect(fs.appendFileSync).toHaveBeenCalled();
    const args = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls.slice(-1)[0];
    const payload = String(args[1]);
    expect(payload).toContain('append-test');
    expect(payload).toContain('appended');
    expect(payload.endsWith('\n')).toBe(true);
  });
});

describe('reportServerError', () => {
  it('extracts the message from an Error instance', () => {
    const err = new Error('database connection lost');
    const ev = reportServerError('db', 'connection lost', err);
    expect(ev.level).toBe('error');
    expect(ev.message).toBe('database connection lost');
    expect(ev.stack).toBeTruthy();
  });

  it('passes through string error', () => {
    const ev = reportServerError('s', 't', 'plain error');
    expect(ev.message).toBe('plain error');
    expect(ev.stack).toBeUndefined();
  });

  it('serializes object error', () => {
    const ev = reportServerError('s', 't', { code: 'E_CRASH' });
    expect(ev.message).toContain('E_CRASH');
  });

  it('falls back to String() when JSON.stringify throws (circular)', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic; // JSON.stringify throws on circular ref
    const ev = reportServerError('s', 't', cyclic);
    expect(typeof ev.message).toBe('string'); // didn't crash
  });

  it('truncates stack at 2000 chars', () => {
    const err = new Error('with long stack');
    err.stack = 'x'.repeat(5000);
    const ev = reportServerError('s', 't', err);
    expect(ev.stack?.length).toBe(2000);
  });

  it('respects category override', () => {
    const ev = reportServerError('s', 't', new Error('x'), { category: 'user' });
    expect(ev.category).toBe('user');
  });

  it('tags the event kind:technical so the bell never surfaces it', () => {
    // WHY: server errors are diagnostics, not product problems -- they belong
    // in the activity feed but must stay quiet (no toast/OS notify). The
    // kind:technical tag is what the bell-gating reads, so it must be set even
    // when the caller picks a non-system category.
    const ev = reportServerError('s', 't', new Error('x'), { category: 'user' });
    expect(ev.kind).toBe('technical');
  });

  it('threads requestId so a server error correlates to its request', () => {
    // WHY: handleError passes event.locals.requestId here so the logged error
    // row == the X-Request-Id response header == the on-screen error ref.
    const ev = reportServerError('server', 't', new Error('x'), { requestId: 'req-server-9' });
    expect(ev.requestId).toBe('req-server-9');
  });
});

describe('HERON_LOG_LEVEL durable-sink gating', () => {
  afterEach(() => {
    delete process.env.HERON_LOG_LEVEL;
  });

  it('an info event below the threshold stays in the live bus but is NOT written to disk', () => {
    // WHY: prod can quiet on-disk volume via HERON_LOG_LEVEL, but the in-app
    // activity feed (the bus) must stay real-time -- quieting the disk must never
    // blind a watching dashboard. This pins that split.
    process.env.HERON_LOG_LEVEL = 'warn';
    (fs.appendFileSync as ReturnType<typeof vi.fn>).mockClear();
    const ev = logEvent('gated', 'quiet info', { level: 'info' });
    expect(bus.recent().some((e) => e.id === ev.id)).toBe(true); // live feed has it
    const wrote = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
      String(c[1]).includes('quiet info'),
    );
    expect(wrote).toBe(false); // durable JSONL did not
  });

  it('a warn event at the threshold IS written to disk', () => {
    process.env.HERON_LOG_LEVEL = 'warn';
    (fs.appendFileSync as ReturnType<typeof vi.fn>).mockClear();
    logEvent('gated', 'loud warn', { level: 'warn' });
    const wrote = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
      String(c[1]).includes('loud warn'),
    );
    expect(wrote).toBe(true);
  });
});

describe('reportToRemote (opt-in remote sink seam)', () => {
  const realFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.HERON_TELEMETRY_ENDPOINT;
  });

  it('is a no-op when HERON_TELEMETRY_ENDPOINT is unset (strict local-first default)', () => {
    logEvent('s', 'boom', { level: 'error' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fire-and-forget POSTs error/warn events to the configured endpoint', () => {
    process.env.HERON_TELEMETRY_ENDPOINT = 'https://sink.example/ingest';
    logEvent('s', 'boom', { level: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://sink.example/ingest');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.title).toBe('boom');
  });

  it('does NOT forward info/success even when configured (only diagnostics leave the box)', () => {
    process.env.HERON_TELEMETRY_ENDPOINT = 'https://sink.example/ingest';
    logEvent('s', 'just info', { level: 'info' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('bus.recent / bus.recentForUser', () => {
  it('recent() returns ALL buffered events regardless of userId', () => {
    logEvent('a', 't1', { userId: 'user-a' });
    logEvent('b', 't2', { userId: 'user-b' });
    logEvent('broadcast', 't3', { userId: null });
    const r = bus.recent();
    expect(r.length).toBeGreaterThanOrEqual(3);
  });

  it('recentForUser(userId) includes their events + broadcasts only', () => {
    logEvent('a', 'for-a', { userId: 'user-a' });
    logEvent('b', 'for-b', { userId: 'user-b' });
    logEvent('broadcast', 'for-all', { userId: null });
    const aFeed = bus.recentForUser('user-a');
    expect(aFeed.some((e) => e.title === 'for-a')).toBe(true);
    expect(aFeed.some((e) => e.title === 'for-all')).toBe(true);
    expect(aFeed.some((e) => e.title === 'for-b')).toBe(false);
  });

  it('recentForUser includes SYSTEM_USER_ID-tagged events', () => {
    __currentUserId = SYSTEM_USER_ID_LOCAL;
    logEvent('sys', 'system event');
    const r = bus.recentForUser('user-a');
    expect(r.some((e) => e.title === 'system event')).toBe(true);
  });

  it('clear() empties the buffer', () => {
    logEvent('a', 't1');
    logEvent('b', 't2');
    expect(bus.recent().length).toBeGreaterThan(0);
    bus.clear();
    expect(bus.recent().length).toBe(0);
  });
});

describe('bus event emission', () => {
  it('emits the "event" channel for every logEvent', () => {
    const seen: string[] = [];
    bus.on('event', (e) => seen.push((e as { title: string }).title));
    logEvent('a', 'subscribe-test');
    expect(seen).toContain('subscribe-test');
  });
});

describe('installBusListener (HMR-safe)', () => {
  it('installs a listener by name', () => {
    const calls: string[] = [];
    const handler = (e: { title: string }) => calls.push(e.title);
    installBusListener('my-listener', handler);
    logEvent('s', 'fired');
    expect(calls).toContain('fired');
  });

  it('replaces an existing listener with the same name (idempotent)', () => {
    const calls: string[] = [];
    const handlerOld = (e: { title: string }) => calls.push(`old:${e.title}`);
    const handlerNew = (e: { title: string }) => calls.push(`new:${e.title}`);
    installBusListener('replaceable', handlerOld);
    installBusListener('replaceable', handlerNew);
    logEvent('s', 'fired');
    expect(calls).toContain('new:fired');
    expect(calls).not.toContain('old:fired');
  });

  it('different names co-exist', () => {
    const calls: string[] = [];
    installBusListener('a', (e) => calls.push(`a:${(e as { title: string }).title}`));
    installBusListener('b', (e) => calls.push(`b:${(e as { title: string }).title}`));
    logEvent('s', 'fired');
    expect(calls).toContain('a:fired');
    expect(calls).toContain('b:fired');
  });
});

describe('burst guard (rate limit)', () => {
  it('emits a rate-limit note after dropping events when window rolls over', () => {
    // Fire > 200 events in tight loop -- the burst limit drops after 200,
    // and a new event in the NEXT window surfaces a "Bus rate-limited"
    // note describing the drops.
    for (let i = 0; i < 250; i++) {
      logEvent('burst', `e${i}`);
    }
    // Advance time past the 1s window so the next emit triggers the
    // "window rolled over -- surface drop count" branch.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2000);
    // The bus uses Date.now() internally, not setTimeout, so we just
    // emit one more event to trigger the window-rolled-over branch.
    logEvent('after-burst', 'next-window');
    const notes = bus.recent().filter((e) => e.title === 'Bus rate-limited');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]?.message).toMatch(/Dropped \d+ events/);
    vi.useRealTimers();
  });
});

describe('buffer cap (MAX_BUFFER = 500)', () => {
  it('shifts oldest events out when buffer exceeds 500', () => {
    bus.clear();
    // Fire 510 events; buffer should hold 500 most-recent.
    // Note: burst guard caps at 200/sec; use fake timers to advance
    // between bursts so all 510 land in the buffer.
    vi.useFakeTimers();
    for (let i = 0; i < 510; i++) {
      logEvent('s', `e${i}`);
      // Advance 10ms between events so we stay well under the burst limit.
      // 510 events × 10ms = 5.1 seconds of bus time.
      vi.setSystemTime(Date.now() + 10);
    }
    vi.useRealTimers();
    const all = bus.recent();
    // The buffer either capped exactly at 500 or stayed at the last 500
    // depending on whether burst-rate notes interspersed; assert <= 500
    // and the most recent event is in the buffer.
    expect(all.length).toBeLessThanOrEqual(500);
    expect(all[all.length - 1]?.title).toBe('e509');
  });
});
