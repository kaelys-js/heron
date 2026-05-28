/**
 * network-resilience -- abort-on-offline + retry-on-recovery.
 *
 * Tests the abort/retry primitive used by lib/api.ts. The fetch
 * wrapper itself is covered by api.test.ts; here we exercise the
 * coordination layer in isolation.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __reset, enqueueForRetry, isRetryable, register, unregister } from './network-resilience';

// Mock BRAND so the netStatus event name is stable.
vi.mock('./brand', () => ({
  BRAND_EVENTS: {
    openNotifications: 'heron:open-notifications',
    notify: 'heron:notify',
    netStatus: 'heron:net-status',
  },
}));

beforeEach(() => {
  __reset();
});

afterEach(() => {
  __reset();
});

describe('network-resilience — isRetryable', () => {
  it('explicit opt-in always wins', () => {
    expect(isRetryable({ method: 'POST' }, true)).toBe(true);
    expect(isRetryable({ method: 'GET' }, false)).toBe(false);
  });

  it('gET / HEAD default to retryable', () => {
    expect(isRetryable({ method: 'GET' }, undefined)).toBe(true);
    expect(isRetryable({ method: 'HEAD' }, undefined)).toBe(true);
    expect(isRetryable({ method: 'get' }, undefined)).toBe(true); // case-insensitive
  });

  it('mutations default to NOT retryable', () => {
    expect(isRetryable({ method: 'POST' }, undefined)).toBe(false);
    expect(isRetryable({ method: 'PUT' }, undefined)).toBe(false);
    expect(isRetryable({ method: 'PATCH' }, undefined)).toBe(false);
    expect(isRetryable({ method: 'DELETE' }, undefined)).toBe(false);
  });

  it('missing method defaults to GET (retryable)', () => {
    expect(isRetryable({}, undefined)).toBe(true);
  });
});

describe('network-resilience — register / unregister', () => {
  it('returns a fresh AbortController when no caller signal', () => {
    const ctrl = register({});
    expect(ctrl).toBeInstanceOf(AbortController);
    expect(ctrl.signal.aborted).toBe(false);
    unregister(ctrl);
  });

  it('bridges caller-supplied signal: external abort triggers ours', () => {
    const callerCtrl = new AbortController();
    const ctrl = register({ signal: callerCtrl.signal });
    expect(ctrl.signal.aborted).toBe(false);
    callerCtrl.abort();
    // Microtask flush
    expect(ctrl.signal.aborted).toBe(true);
    unregister(ctrl);
  });

  it('propagates netStatus={online:false} → aborts every in-flight', () => {
    const a = register({});
    const b = register({});
    const c = register({});
    expect(a.signal.aborted).toBe(false);
    expect(b.signal.aborted).toBe(false);
    expect(c.signal.aborted).toBe(false);

    window.dispatchEvent(new CustomEvent('heron:net-status', { detail: { online: false } }));

    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(c.signal.aborted).toBe(true);
    unregister(a);
    unregister(b);
    unregister(c);
  });

  it('netStatus={online:true} does NOT abort in-flight', () => {
    const a = register({});
    window.dispatchEvent(new CustomEvent('heron:net-status', { detail: { online: true } }));
    expect(a.signal.aborted).toBe(false);
    unregister(a);
  });
});

describe('network-resilience — retry queue', () => {
  it('drains queued entries on `online` event', async () => {
    // Mock global fetch so the drain path is observable.
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);

    let resolved = false;
    enqueueForRetry({
      url: '/api/jobs',
      init: { method: 'GET' },
      resolve: () => {
        resolved = true;
      },
      reject: () => undefined,
    });
    window.dispatchEvent(new Event('online'));
    // Microtask + promise flush
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith('/api/jobs', { method: 'GET' });
    expect(resolved).toBe(true);
  });

  it('drains queued entries on netStatus={online:true}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    let resolved = false;
    enqueueForRetry({
      url: '/api/stats',
      init: { method: 'GET' },
      resolve: () => {
        resolved = true;
      },
      reject: () => undefined,
    });
    window.dispatchEvent(new CustomEvent('heron:net-status', { detail: { online: true } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(resolved).toBe(true);
  });

  it('caps the queue size and rejects the dropped oldest entry', () => {
    let dropped = false;
    enqueueForRetry({
      url: '/api/jobs',
      init: { method: 'GET' },
      resolve: () => undefined,
      reject: () => {
        dropped = true;
      },
    });
    // Fill the cap (50) -- push 50 more so the first one falls out.
    for (let i = 0; i < 50; i++) {
      enqueueForRetry({
        url: '/api/jobs',
        init: { method: 'GET' },
        resolve: () => undefined,
        reject: () => undefined,
      });
    }
    expect(dropped).toBe(true);
  });

  it('does not double-drain: each entry replays at most once per signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);
    enqueueForRetry({
      url: '/api/jobs',
      init: { method: 'GET' },
      resolve: () => undefined,
      reject: () => undefined,
    });
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 0));
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
