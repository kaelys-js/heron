/**
 * lib/client/backend-discovery — dense source + URL scenarios.
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
  },
}));

const { resolveBackend, setManualBackend, pillLabel, clearBackendCache } = await import(
  './backend-discovery'
);

const SOURCES = ['embedded', 'dev', 'lan', 'tailscale', 'remote', 'manual'] as const;
const PILL_LABELS = {
  embedded: 'PROD',
  dev: 'DEV',
  lan: 'LAN',
  tailscale: 'TAILSCALE',
  remote: 'REMOTE',
  manual: 'MANUAL',
} as const;

describe('pillLabel — every source', () => {
  it.each(SOURCES)('source %s maps to known pill', (source) => {
    expect(pillLabel(source)).toBe(PILL_LABELS[source]);
  });
});

describe('pillLabel — uppercase output', () => {
  it.each(SOURCES)('source %s pill is uppercase', (source) => {
    expect(pillLabel(source)).toBe(pillLabel(source).toUpperCase());
  });
});

describe('setManualBackend — every URL shape', () => {
  beforeEach(() => prefsBacking.clear());

  it.each([
    'https://example.com',
    'http://192.168.1.1:5173',
    'https://app.heron.dev',
    'https://my.tail-xxxx.ts.net',
    'http://localhost:5173',
    'https://staging.example.com:8443',
  ])('URL %s → source=manual', async (url) => {
    const r = await setManualBackend(url);
    expect(r.source).toBe('manual');
    expect(r.url).toBe(url);
  });
});

describe('setManualBackend — resolvedAt timestamp', () => {
  beforeEach(() => prefsBacking.clear());

  it.each([
    'https://a.example',
    'https://b.example',
    'https://c.example',
  ])('URL %s sets resolvedAt to recent ms', async (url) => {
    const before = Date.now();
    const r = await setManualBackend(url);
    expect(r.resolvedAt).toBeGreaterThanOrEqual(before);
    expect(r.resolvedAt).toBeLessThanOrEqual(Date.now() + 100);
  });
});

describe('clearBackendCache — every cache state', () => {
  it('absent key — no throw', async () => {
    prefsBacking.clear();
    await expect(clearBackendCache()).resolves.toBeUndefined();
  });

  it('present key — clears', async () => {
    prefsBacking.set(`${BRAND_STORAGE_PREFIX}:backend-resolved`, '{}');
    await clearBackendCache();
    expect(prefsBacking.get(`${BRAND_STORAGE_PREFIX}:backend-resolved`)).toBeUndefined();
  });

  it.each([1, 5, 10])('called %i times — idempotent', async (n) => {
    prefsBacking.set(`${BRAND_STORAGE_PREFIX}:backend-resolved`, '{}');
    for (let i = 0; i < n; i++) await clearBackendCache();
    expect(prefsBacking.get(`${BRAND_STORAGE_PREFIX}:backend-resolved`)).toBeUndefined();
  });
});

describe('resolveBackend — waterfall with fetch stub', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prefsBacking.clear();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['http://embedded.example', 'embedded'],
    ['http://localhost:5173', 'dev'],
  ] as const)('reaches %s URL → source=%s', async (url, source) => {
    fetchSpy.mockImplementation(async (u: string) => {
      if (u.includes(url.replace(/^https?:\/\//, ''))) {
        return new Response('ok', { status: 200 });
      }
      return new Response('boom', { status: 500 });
    });

    const r = await resolveBackend({
      embeddedUrl: source === 'embedded' ? url : undefined,
    });
    expect(r.source).toBe(source);
  });
});
