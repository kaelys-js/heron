/**
 * lib/client/online-status -- dense listener + transition scenarios.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isOnline, OfflineError, onlineStore } from './online-status.svelte';

describe('OfflineError — instance shape', () => {
  it.each([
    'name === "OfflineError"',
    'isOffline === true',
    'message === "Offline"',
    'extends Error',
  ])('property %s', (kind) => {
    const e = new OfflineError();
    if (kind.startsWith('name')) expect(e.name).toBe('OfflineError');
    if (kind.startsWith('isOffline')) expect(e.isOffline).toBe(true);
    if (kind.startsWith('message')) expect(e.message).toBe('Offline');
    if (kind.startsWith('extends')) expect(e).toBeInstanceOf(Error);
  });
});

describe('isOnline — reads from store', () => {
  beforeEach(() => {
    onlineStore.online = true;
  });
  afterEach(() => {
    onlineStore.online = true;
  });

  it.each([true, false])('online=%s', (state) => {
    onlineStore.online = state;
    expect(isOnline()).toBe(state);
  });
});

describe('onlineStore.addListener — multi-listener', () => {
  beforeEach(() => {
    onlineStore.destroy();
    onlineStore.online = true;
  });
  afterEach(() => onlineStore.destroy());

  it.each([1, 2, 5, 10])('%i listeners all fire on transition', (n) => {
    const counts = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      onlineStore.addListener(() => {
        counts[i]++;
      });
    }
    (onlineStore as any).update(false, 'probe');
    for (let i = 0; i < n; i++) {
      expect(counts[i]).toBe(1);
    }
  });
});

describe('onlineStore — update transitions', () => {
  beforeEach(() => {
    onlineStore.destroy();
    onlineStore.online = true;
  });

  it.each([
    [true, false, true],
    [false, true, true],
    [true, true, false],
    [false, false, false],
  ] as const)('from %s to %s → listeners fire=%s', (start, end, shouldFire) => {
    onlineStore.online = start;
    let fired = false;
    onlineStore.addListener(() => {
      fired = true;
    });
    (onlineStore as any).update(end, end ? null : 'probe');
    expect(fired).toBe(shouldFire);
    onlineStore.destroy();
  });
});

describe('onlineStore — reason persistence', () => {
  beforeEach(() => onlineStore.destroy());

  it.each([
    'navigator',
    'probe',
    'native',
    null,
  ])('reason %s after offline transition', (reason) => {
    onlineStore.online = true;
    (onlineStore as any).update(false, reason ?? 'probe');
    if (reason) expect(onlineStore.reason).toBe(reason);
    onlineStore.destroy();
  });
});

describe('onlineStore — listener removal', () => {
  beforeEach(() => {
    onlineStore.destroy();
    onlineStore.online = true;
  });

  it.each([1, 3, 5])('removing %i listeners stops fire', (n) => {
    onlineStore.online = true;
    const counts = Array(n).fill(0);
    const offs = Array.from({ length: n }, (_, i) =>
      onlineStore.addListener(() => {
        counts[i]++;
      }),
    );
    for (const off of offs) off();
    (onlineStore as any).update(false, 'probe');
    for (let i = 0; i < n; i++) {
      expect(counts[i]).toBe(0);
    }
  });
});
