/**
 * offline-cache -- IndexedDB-backed read cache.
 *
 * Uses `fake-indexeddb` (already in test-setup.ts) so each test runs
 * against an isolated in-memory IDB instance.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetDbHandle, clearCache, getCached, isCacheable, setCached } from './offline-cache';

beforeEach(() => {
  __resetDbHandle();
});

afterEach(async () => {
  await clearCache();
  __resetDbHandle();
});

describe('offline-cache — isCacheable', () => {
  it('matches GETs on the allowlist', () => {
    expect(isCacheable('/api/jobs')).toBe(true);
    expect(isCacheable('/api/jobs?status=Applied')).toBe(true);
    expect(isCacheable('/api/stats')).toBe(true);
    expect(isCacheable('/api/notifications/feed')).toBe(true);
    expect(isCacheable('/api/profiles')).toBe(true);
  });

  it('rejects URLs not on the allowlist', () => {
    expect(isCacheable('/api/health')).toBe(false); // probe — never cache
    expect(isCacheable('/api/scan')).toBe(false); // mutation
    expect(isCacheable('/api/job/abc123')).toBe(false); // individual job
    expect(isCacheable('/api/auth/session')).toBe(false);
  });

  it('handles absolute URLs (Capacitor backend-prefixed)', () => {
    expect(isCacheable('http://192.168.1.10:5173/api/jobs?status=Applied')).toBe(true);
    expect(isCacheable('http://192.168.1.10:5173/api/health')).toBe(false);
  });
});

describe('offline-cache — set/get round-trip', () => {
  it('round-trips a small JSON payload', async () => {
    await setCached('/api/jobs', { jobs: [{ id: '1', title: 'Engineer' }] });
    const cached = await getCached<{ jobs: Array<{ id: string }> }>('/api/jobs');
    expect(cached).not.toBeNull();
    expect(cached?.data.jobs[0].id).toBe('1');
    expect(typeof cached?.cachedAt).toBe('number');
  });

  it('separate URLs do not collide', async () => {
    await setCached('/api/jobs', { tag: 'jobs' });
    await setCached('/api/stats', { tag: 'stats' });
    const j = await getCached<{ tag: string }>('/api/jobs');
    const s = await getCached<{ tag: string }>('/api/stats');
    expect(j?.data.tag).toBe('jobs');
    expect(s?.data.tag).toBe('stats');
  });

  it('overwrites existing entry on second set', async () => {
    await setCached('/api/stats', { count: 1 });
    await setCached('/api/stats', { count: 2 });
    const r = await getCached<{ count: number }>('/api/stats');
    expect(r?.data.count).toBe(2);
  });

  it('returns null for non-cacheable URL even if there is a stale entry', async () => {
    // Forcibly write a non-cacheable URL via a direct call. setCached
    // should reject it -- but if it leaked through, getCached must
    // still gate the read on isCacheable.
    await setCached('/api/scan', { sneaky: true });
    expect(await getCached('/api/scan')).toBeNull();
  });

  it('returns null when nothing cached', async () => {
    expect(await getCached('/api/jobs')).toBeNull();
  });
});

describe('offline-cache — clearCache', () => {
  it('removes all entries', async () => {
    await setCached('/api/jobs', { x: 1 });
    await setCached('/api/stats', { y: 2 });
    await clearCache();
    expect(await getCached('/api/jobs')).toBeNull();
    expect(await getCached('/api/stats')).toBeNull();
  });
});
