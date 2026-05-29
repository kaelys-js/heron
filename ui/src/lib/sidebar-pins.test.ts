/**
 * lib/sidebar-pins -- localStorage-backed exclusion set for the sidebar.
 *
 * Tests:
 *   • init() reads from localStorage
 *   • unpin / pin / unpinAll / resetAll mutate + persist
 *   • isExcluded resolves correctly
 *   • Corrupt localStorage values fall back gracefully
 *   • Empty / missing key starts empty
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BRAND_STORAGE_PREFIX } from '$lib/client/brand';
import { pinStore } from './sidebar-pins.svelte';

const KEY = `${BRAND_STORAGE_PREFIX}:sidebar-pin-excluded`;

describe('pinStore', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    pinStore.resetAll();
  });

  afterEach(() => {
    pinStore.resetAll();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('starts with empty excluded set', () => {
    expect(pinStore.excluded.size).toBe(0);
  });

  it('init() reads from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify(['a', 'b']));
    pinStore.init();
    expect(pinStore.excluded.has('a')).toBe(true);
    expect(pinStore.excluded.has('b')).toBe(true);
  });

  it('init() falls back to empty on corrupt JSON', () => {
    localStorage.setItem(KEY, '{not valid json');
    pinStore.init();
    expect(pinStore.excluded.size).toBe(0);
  });

  it('init() falls back when stored value is not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
    pinStore.init();
    expect(pinStore.excluded.size).toBe(0);
  });

  it('init() filters non-string entries', () => {
    localStorage.setItem(KEY, JSON.stringify(['a', 42, null, 'b']));
    pinStore.init();
    expect(pinStore.excluded.has('a')).toBe(true);
    expect(pinStore.excluded.has('b')).toBe(true);
    expect(pinStore.excluded.size).toBe(2);
  });

  it('unpin(id) adds id + persists', () => {
    pinStore.unpin('x');
    expect(pinStore.excluded.has('x')).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY) || '[]')).toContain('x');
  });

  it('unpin is idempotent', () => {
    pinStore.unpin('x');
    pinStore.unpin('x');
    expect(pinStore.excluded.size).toBe(1);
  });

  it('pin(id) removes id from excluded', () => {
    pinStore.unpin('x');
    pinStore.pin('x');
    expect(pinStore.excluded.has('x')).toBe(false);
  });

  it('pin is a no-op when id is not excluded', () => {
    pinStore.pin('not-here');
    expect(pinStore.excluded.size).toBe(0);
  });

  it('unpinAll adds every id', () => {
    pinStore.unpinAll(['a', 'b', 'c']);
    expect(pinStore.excluded.size).toBe(3);
  });

  it('unpinAll merges with existing exclusions', () => {
    pinStore.unpin('a');
    pinStore.unpinAll(['b', 'c']);
    expect(pinStore.excluded.size).toBe(3);
  });

  it('resetAll() clears + persists empty array', () => {
    pinStore.unpinAll(['a', 'b']);
    pinStore.resetAll();
    expect(pinStore.excluded.size).toBe(0);
    expect(JSON.parse(localStorage.getItem(KEY) || '[]')).toEqual([]);
  });

  it('isExcluded reflects current set', () => {
    expect(pinStore.isExcluded('a')).toBe(false);
    pinStore.unpin('a');
    expect(pinStore.isExcluded('a')).toBe(true);
  });

  it('persists across init() calls', () => {
    pinStore.unpin('survives');
    pinStore.excluded = new Set(); // simulate fresh module
    pinStore.init();
    expect(pinStore.isExcluded('survives')).toBe(true);
  });
});
