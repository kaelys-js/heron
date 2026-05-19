/**
 * lib/client/backend-discovery -- resolveBackend / setManualBackend / pillLabel.
 *
 * Mocks fetch + Capacitor Preferences to exercise every branch of the
 * waterfall. The order of attempts is: cache → embedded → dev →
 * mDNS LAN → tailscale → production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND_STORAGE_PREFIX } from '$lib/client/brand';

const prefsBacking = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: prefsBacking.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      prefsBacking.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      prefsBacking.delete(key);
    },
    clear: async () => {
      prefsBacking.clear();
    },
  },
}));

const { resolveBackend, setManualBackend, pillLabel, clearBackendCache, BackendNotFoundError } =
  await import('./backend-discovery');

describe('pillLabel', () => {
  it.each([
    ['embedded', 'PROD'],
    ['dev', 'DEV'],
    ['lan', 'LAN'],
    ['tailscale', 'TAILSCALE'],
    ['remote', 'REMOTE'],
    ['manual', 'MANUAL'],
  ] as const)('maps %s → %s', (source, expected) => {
    expect(pillLabel(source)).toBe(expected);
  });
});

describe('BackendNotFoundError', () => {
  it('has name "BackendNotFoundError"', () => {
    expect(new BackendNotFoundError('m').name).toBe('BackendNotFoundError');
  });
  it('extends Error', () => {
    expect(new BackendNotFoundError('m')).toBeInstanceOf(Error);
  });
});

describe('setManualBackend', () => {
  beforeEach(() => prefsBacking.clear());
  it('returns a ResolvedBackend with source=manual', async () => {
    const r = await setManualBackend('https://my-backend.tail.ts.net');
    expect(r.source).toBe('manual');
    expect(r.url).toBe('https://my-backend.tail.ts.net');
    expect(typeof r.resolvedAt).toBe('number');
  });
  it('writes the cache so subsequent resolveBackend picks it up', async () => {
    await setManualBackend('https://my.example');
    expect(prefsBacking.get(`${BRAND_STORAGE_PREFIX}:backend-resolved`)).toContain('my.example');
  });
});

describe('clearBackendCache', () => {
  beforeEach(() => prefsBacking.clear());
  it('removes the cache key', async () => {
    prefsBacking.set(`${BRAND_STORAGE_PREFIX}:backend-resolved`, 'whatever');
    await clearBackendCache();
    expect(prefsBacking.get(`${BRAND_STORAGE_PREFIX}:backend-resolved`)).toBeUndefined();
  });
  it('is safe when key is absent', async () => {
    await expect(clearBackendCache()).resolves.toBeUndefined();
  });
});

describe('resolveBackend — waterfall', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prefsBacking.clear();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns cached value when fresh + still alive', async () => {
    // Seed cache with a fresh entry
    prefsBacking.set(
      `${BRAND_STORAGE_PREFIX}:backend-resolved`,
      JSON.stringify({
        url: 'http://cached.example',
        source: 'dev',
        resolvedAt: Date.now(),
      }),
    );
    fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));
    const r = await resolveBackend({});
    expect(r.url).toBe('http://cached.example');
    expect(r.source).toBe('dev');
  });

  it('ignores stale cache (older than 5min)', async () => {
    prefsBacking.set(
      `${BRAND_STORAGE_PREFIX}:backend-resolved`,
      JSON.stringify({
        url: 'http://stale.example',
        source: 'dev',
        resolvedAt: Date.now() - 6 * 60 * 1000,
      }),
    );
    // Stale → falls through; localhost probe should fail since fetchSpy returns 500
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(resolveBackend({})).rejects.toThrow(BackendNotFoundError);
  });

  it('forceRefresh bypasses the cache', async () => {
    prefsBacking.set(
      `${BRAND_STORAGE_PREFIX}:backend-resolved`,
      JSON.stringify({
        url: 'http://cached.example',
        source: 'dev',
        resolvedAt: Date.now(),
      }),
    );
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(resolveBackend({ forceRefresh: true })).rejects.toThrow(BackendNotFoundError);
  });

  it('picks embedded URL when it responds 200', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('embedded.example')) return new Response('ok', { status: 200 });
      return new Response('boom', { status: 500 });
    });
    const r = await resolveBackend({ embeddedUrl: 'http://embedded.example' });
    expect(r.source).toBe('embedded');
    expect(r.url).toBe('http://embedded.example');
  });

  it('falls through to localhost dev server when embedded is down', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('localhost:5173')) return new Response('ok', { status: 200 });
      return new Response('boom', { status: 500 });
    });
    const r = await resolveBackend({ embeddedUrl: 'http://embedded.example' });
    expect(r.source).toBe('dev');
    expect(r.url).toBe('http://localhost:5173');
  });

  it('falls through to tailscale when local options unavailable', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('tail.ts.net')) return new Response('ok', { status: 200 });
      return new Response('boom', { status: 500 });
    });
    const r = await resolveBackend({ tailscaleHost: 'mac.tail.ts.net' });
    expect(r.source).toBe('tailscale');
    expect(r.url).toContain('tail.ts.net');
  });

  it('uses production URL last', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('prod.example')) return new Response('ok', { status: 200 });
      return new Response('boom', { status: 500 });
    });
    const r = await resolveBackend({ productionUrl: 'https://prod.example' });
    expect(r.source).toBe('remote');
    expect(r.url).toBe('https://prod.example');
  });

  it('throws BackendNotFoundError when EVERY candidate fails', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(
      resolveBackend({
        embeddedUrl: 'http://e.example',
        tailscaleHost: 'ts.example',
        productionUrl: 'https://p.example',
      }),
    ).rejects.toThrow(BackendNotFoundError);
  });

  it('tailscaleHost without protocol gets http:// prefix', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.startsWith('http://mac.tail')) return new Response('ok', { status: 200 });
      return new Response('boom', { status: 500 });
    });
    const r = await resolveBackend({ tailscaleHost: 'mac.tail.ts.net:5173' });
    expect(r.url).toBe('http://mac.tail.ts.net:5173');
  });

  it('writes the cache after successful resolution', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('localhost:5173')) return new Response('ok', { status: 200 });
      return new Response('boom', { status: 500 });
    });
    await resolveBackend({});
    expect(prefsBacking.get(`${BRAND_STORAGE_PREFIX}:backend-resolved`)).toContain(
      'localhost:5173',
    );
  });

  it('respects custom probeTimeoutMs', async () => {
    let timed = false;
    fetchSpy.mockImplementation(async (_url: string, init?: any) => {
      // Slow response -- abort signal should fire if timeout works
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          timed = true;
          reject(new Error('aborted'));
        });
      });
    });
    await expect(resolveBackend({ probeTimeoutMs: 50 })).rejects.toThrow(BackendNotFoundError);
    expect(timed).toBe(true);
  });

  it('cached entry that fails health re-probe is invalidated', async () => {
    prefsBacking.set(
      `${BRAND_STORAGE_PREFIX}:backend-resolved`,
      JSON.stringify({
        url: 'http://gone.example',
        source: 'dev',
        resolvedAt: Date.now(),
      }),
    );
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('gone.example')) return new Response('dead', { status: 500 });
      if (url.includes('localhost:5173')) return new Response('ok', { status: 200 });
      return new Response('boom', { status: 500 });
    });
    const r = await resolveBackend({});
    expect(r.source).toBe('dev');
    expect(r.url).toBe('http://localhost:5173');
  });

  // M7 -- stale-IP race fix. The validation timeout is now 250ms ± 50ms
  // (was a flat 500ms). A stale IP that took 400ms to respond used to
  // win the race; now it loses cleanly.
  it('M7: cached entry that responds slowly (>300ms) loses the race + re-resolves', async () => {
    prefsBacking.set(
      `${BRAND_STORAGE_PREFIX}:backend-resolved`,
      JSON.stringify({
        url: 'http://slow-stale.example',
        source: 'dev',
        resolvedAt: Date.now(),
      }),
    );
    fetchSpy.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('slow-stale.example')) {
        // 400ms response -- exceeds the 250±50ms validation timeout.
        return new Promise<Response>((resolve, reject) => {
          const t = setTimeout(() => resolve(new Response('ok', { status: 200 })), 400);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('aborted'));
          });
        });
      }
      if (url.includes('localhost:5173')) return new Response('ok', { status: 200 });
      return new Response('boom', { status: 500 });
    });
    const r = await resolveBackend({});
    // Should have skipped the stale URL and resolved to localhost:5173.
    expect(r.url).toBe('http://localhost:5173');
  });

  // M3 -- global resolver timeout. If EVERY candidate hangs (slow DNS +
  // unreachable Tailscale + unresponsive prod), throw within 10s rather
  // than hang forever. Use a very short timeout-friendly mock and a
  // generous test budget to validate the timer-race path without
  // actually waiting 10s.
  it('M3: throws BackendNotFoundError if every candidate hangs', async () => {
    fetchSpy.mockImplementation(
      (_url: string, init?: any) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    // probeTimeoutMs short so the inner waterfall finishes fast and
    // we end up in the "no candidate matched" path.
    await expect(resolveBackend({ probeTimeoutMs: 10 })).rejects.toThrow(BackendNotFoundError);
  });
});
