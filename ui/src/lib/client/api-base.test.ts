/**
 * api-base -- where /api/* calls go. Web is same-origin (''); Capacitor WebViews
 * (heron://localhost) resolve a real backend URL via discovery. These tests pin
 * the resolution waterfall + the reactive status listener pattern.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveBackendMock = vi.fn();
vi.mock('./backend-discovery', () => ({
  resolveBackend: (opts: unknown) => resolveBackendMock(opts),
}));

// Dynamic import inside getApiBase's cross-origin path. Default: no shared URLs.
const getSharedTailscaleUrl = vi.fn<() => Promise<string | null>>(async () => null);
const getSharedProductionUrl = vi.fn<() => Promise<string | null>>(async () => null);
vi.mock('./native-bridge', () => ({
  getSharedTailscaleUrl: () => getSharedTailscaleUrl(),
  getSharedProductionUrl: () => getSharedProductionUrl(),
}));

const { getApiBase, apiBaseSync, resetApiBase, getBackendStatus, onBackendStatusChange } =
  await import('./api-base');

/** Run a block with window.location.origin overridden (Capacitor cross-origin). */
async function withOrigin(origin: string, fn: () => Promise<void> | void): Promise<void> {
  const orig = Object.getOwnPropertyDescriptor(window, 'location');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { origin },
  });
  try {
    await fn();
  } finally {
    if (orig) Object.defineProperty(window, 'location', orig);
  }
}

beforeEach(() => {
  resetApiBase(); // clears the module-level cache + resolving promise
  resolveBackendMock.mockReset();
  getSharedTailscaleUrl.mockReset().mockResolvedValue(null);
  getSharedProductionUrl.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  resetApiBase();
});

describe('backend status listeners', () => {
  it('starts idle and notifies subscribers on change, then stops after unsubscribe', async () => {
    expect(getBackendStatus()).toEqual({ state: 'idle' });
    const seen: string[] = [];
    const off = onBackendStatusChange((s) => seen.push(s.state));
    // The same-origin resolve flips status to 'resolved' -> the listener fires.
    await getApiBase();
    expect(seen).toContain('resolved');
    off();
    const countAfterOff = seen.length;
    resetApiBase(); // would emit 'idle' -- but we've unsubscribed
    expect(seen.length).toBe(countAfterOff);
  });

  it('one throwing listener does not break the others (isolated fan-out)', async () => {
    const good: string[] = [];
    const offBad = onBackendStatusChange(() => {
      throw new Error('bad subscriber');
    });
    const offGood = onBackendStatusChange((s) => good.push(s.state));
    await getApiBase();
    expect(good).toContain('resolved'); // good listener still ran
    offBad();
    offGood();
  });
});

describe('getApiBase -- same-origin (web)', () => {
  it("returns '' and marks resolved/embedded when the origin is http(s)", async () => {
    // jsdom's default window.location.origin is an http URL -> same-origin path.
    const base = await getApiBase();
    expect(base).toBe('');
    const st = getBackendStatus();
    expect(st.state).toBe('resolved');
    if (st.state === 'resolved') expect(st.source).toBe('embedded');
    expect(resolveBackendMock).not.toHaveBeenCalled(); // never hit discovery
  });

  it('memoizes -- a second call returns the cache without re-resolving', async () => {
    await getApiBase();
    await getApiBase();
    // apiBaseSync reads the cached value (here '' for same-origin).
    expect(apiBaseSync()).toBe('');
  });
});

describe('getApiBase -- cross-origin (Capacitor discovery)', () => {
  it('resolves via backend-discovery, strips a trailing slash, and caches', async () => {
    resolveBackendMock.mockResolvedValue({ url: 'http://10.0.0.5:5173/', source: 'lan' });
    await withOrigin('heron://localhost', async () => {
      const base = await getApiBase();
      expect(base).toBe('http://10.0.0.5:5173'); // trailing slash removed
      expect(apiBaseSync()).toBe('http://10.0.0.5:5173');
      const st = getBackendStatus();
      expect(st.state).toBe('resolved');
      if (st.state === 'resolved') expect(st.source).toBe('lan');
    });
  });

  it('forwards persisted Tailscale + production URLs to the resolver', async () => {
    getSharedTailscaleUrl.mockResolvedValue('imac.tail-xxxx.ts.net:5173');
    getSharedProductionUrl.mockResolvedValue('https://heron.example.com');
    resolveBackendMock.mockResolvedValue({
      url: 'https://heron.example.com',
      source: 'production',
    });
    await withOrigin('heron://localhost', async () => {
      await getApiBase();
      expect(resolveBackendMock).toHaveBeenCalledWith({
        tailscaleHost: 'imac.tail-xxxx.ts.net:5173',
        productionUrl: 'https://heron.example.com',
      });
    });
  });

  it('surfaces an error status (and rejects) when discovery fails', async () => {
    resolveBackendMock.mockRejectedValue(new Error('no backend found'));
    await withOrigin('heron://localhost', async () => {
      await expect(getApiBase()).rejects.toThrow('no backend found');
      const st = getBackendStatus();
      expect(st.state).toBe('error');
      if (st.state === 'error') expect(st.message).toContain('no backend found');
    });
  });
});

describe('resetApiBase', () => {
  it('drops the cache and returns to idle so the next call re-resolves', async () => {
    await getApiBase();
    resetApiBase();
    expect(apiBaseSync()).toBe(''); // cache cleared
    expect(getBackendStatus()).toEqual({ state: 'idle' });
  });
});
