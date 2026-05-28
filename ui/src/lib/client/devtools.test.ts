/**
 * Developer-tools opt-in: persists to localStorage (the client button gate)
 * AND a cookie (the SSR route gates), and the reactive getter reflects state.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { devtoolsEnabled, setDevtools } from './devtools.svelte';
import { DEVTOOLS_STORAGE_KEY, DEVTOOLS_COOKIE } from '$lib/devtools-keys';

describe('devtools opt-in', () => {
  beforeEach(() => setDevtools(false));
  afterEach(() => setDevtools(false));

  it('is off by default', () => {
    expect(devtoolsEnabled()).toBe(false);
    expect(localStorage.getItem(DEVTOOLS_STORAGE_KEY)).toBeNull();
  });

  it('enabling persists to localStorage + cookie and flips the getter', () => {
    setDevtools(true);
    expect(devtoolsEnabled()).toBe(true);
    expect(localStorage.getItem(DEVTOOLS_STORAGE_KEY)).toBe('1');
    expect(document.cookie).toContain(`${DEVTOOLS_COOKIE}=1`);
  });

  it('disabling clears localStorage + cookie', () => {
    setDevtools(true);
    setDevtools(false);
    expect(devtoolsEnabled()).toBe(false);
    expect(localStorage.getItem(DEVTOOLS_STORAGE_KEY)).toBeNull();
    expect(document.cookie).not.toContain(`${DEVTOOLS_COOKIE}=1`);
  });
});
