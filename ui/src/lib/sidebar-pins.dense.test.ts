/**
 * lib/sidebar-pins -- dense scenarios for the pin/unpin localStorage store.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pinStore } from './sidebar-pins.svelte';

describe('pinStore.unpin — many ids', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    pinStore.resetAll();
  });
  afterEach(() => pinStore.resetAll());

  it.each([1, 5, 10, 25, 50, 100])('unpinning %i ids leaves them in the set', (n) => {
    for (let i = 0; i < n; i++) {
      pinStore.unpin(`id-${i}`);
    }
    expect(pinStore.excluded.size).toBe(n);
  });
});

describe('pinStore.unpinAll — bulk', () => {
  beforeEach(() => pinStore.resetAll());
  afterEach(() => pinStore.resetAll());

  it.each([1, 5, 25, 100])('unpinAll([%i ids]) adds all', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `b-${i}`);
    pinStore.unpinAll(ids);
    expect(pinStore.excluded.size).toBe(n);
  });
});

describe('pinStore.pin — every previously-unpinned id', () => {
  beforeEach(() => pinStore.resetAll());

  it.each([
    'a',
    'b',
    'c',
    'job-1',
    'job-2',
    `long-id-${'x'.repeat(50)}`,
    '🎉-emoji',
  ])('unpin then pin id %s removes it', (id) => {
    pinStore.unpin(id);
    expect(pinStore.isExcluded(id)).toBe(true);
    pinStore.pin(id);
    expect(pinStore.isExcluded(id)).toBe(false);
  });
});

describe('pinStore.isExcluded — exact-match semantics', () => {
  beforeEach(() => pinStore.resetAll());

  it.each([
    ['job-1', 'job-1', true],
    ['job-1', 'job-2', false],
    ['job-1', 'JOB-1', false],
    ['', '', true],
  ] as const)('unpin "%s", isExcluded("%s") → %s', (added, queried, expected) => {
    pinStore.unpin(added);
    expect(pinStore.isExcluded(queried)).toBe(expected);
  });
});

describe('pinStore.resetAll — clears regardless of count', () => {
  beforeEach(() => pinStore.resetAll());

  it.each([1, 10, 100])('with %i pinned, resetAll empties', (n) => {
    for (let i = 0; i < n; i++) {
      pinStore.unpin(`r-${i}`);
    }
    pinStore.resetAll();
    expect(pinStore.excluded.size).toBe(0);
  });
});

describe('pinStore — persistence across virtual re-init', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    pinStore.resetAll();
  });

  it.each([1, 5, 10, 25])('%i pins survive init() reload', (n) => {
    for (let i = 0; i < n; i++) {
      pinStore.unpin(`p-${i}`);
    }
    // Simulate fresh init (clear in-memory state, then re-read storage).
    pinStore.excluded = new Set();
    pinStore.init();
    expect(pinStore.excluded.size).toBe(n);
  });
});

describe('pinStore — readSet defensive branches', () => {
  const KEY = 'heron:sidebar-pin-excluded';
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    pinStore.resetAll();
  });

  it('init() returns empty set when localStorage contains corrupted JSON', () => {
    localStorage.setItem(KEY, '{not-json');
    pinStore.excluded = new Set();
    pinStore.init();
    expect(pinStore.excluded.size).toBe(0);
  });

  it('init() returns empty set when localStorage parses to a non-array', () => {
    localStorage.setItem(KEY, '"a string, not an array"');
    pinStore.excluded = new Set();
    pinStore.init();
    expect(pinStore.excluded.size).toBe(0);
  });

  it('init() filters out non-string items in a mixed-type array', () => {
    localStorage.setItem(KEY, JSON.stringify(['ok', 42, null, 'also-ok']));
    pinStore.excluded = new Set();
    pinStore.init();
    expect(pinStore.excluded.size).toBe(2);
    expect(pinStore.excluded.has('ok')).toBe(true);
    expect(pinStore.excluded.has('also-ok')).toBe(true);
  });
});

describe('pinStore.pin -- noop when not excluded', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    pinStore.resetAll();
  });

  it('pin(id) is a noop when id is not currently excluded', () => {
    pinStore.pin('was-never-excluded');
    expect(pinStore.excluded.size).toBe(0);
  });
});
