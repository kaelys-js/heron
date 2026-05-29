/**
 * lib/theme -- light/dark/system mode store + view-transition theme swap.
 *
 * jsdom env. The view-transition path is gated on doc.startViewTransition
 * which jsdom doesn't ship -- that branch is exercised only on real
 * browsers (component project tests it indirectly).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND_STORAGE_KEYS } from '$lib/client/brand';

// $app/environment.browser -- module must be mocked before import
vi.mock('$app/environment', () => ({ browser: true }));

const { theme } = await import('./theme.svelte');

describe('theme store', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    theme.destroy();
    theme.mode = 'system';
    theme.resolved = 'dark';
  });

  afterEach(() => {
    theme.destroy();
  });

  it('default mode is "system"', () => {
    expect(theme.mode).toBe('system');
  });

  it('set("light") updates mode + persists', () => {
    theme.set('light');
    expect(theme.mode).toBe('light');
    expect(localStorage.getItem(BRAND_STORAGE_KEYS.theme)).toBe('light');
  });

  it('set("dark") updates mode + persists', () => {
    theme.set('dark');
    expect(theme.mode).toBe('dark');
    expect(localStorage.getItem(BRAND_STORAGE_KEYS.theme)).toBe('dark');
  });

  it('set("system") updates mode', () => {
    theme.set('system');
    expect(theme.mode).toBe('system');
  });

  it('toggle() from dark → light', () => {
    theme.set('dark');
    theme.toggle();
    expect(theme.mode).toBe('light');
  });

  it('toggle() from light → dark', () => {
    theme.set('light');
    theme.toggle();
    expect(theme.mode).toBe('dark');
  });

  it('init() reads from localStorage', () => {
    localStorage.setItem(BRAND_STORAGE_KEYS.theme, 'light');
    theme.init();
    expect(theme.mode).toBe('light');
  });

  it('init() defaults to "system" when storage is invalid', () => {
    localStorage.setItem(BRAND_STORAGE_KEYS.theme, 'invalid-value');
    theme.init();
    expect(theme.mode).toBe('system');
  });

  it('init() is idempotent', () => {
    theme.init();
    const first = theme.mode;
    theme.init();
    expect(theme.mode).toBe(first);
  });

  it('destroy() resets inited flag (init can re-fire)', () => {
    theme.init();
    theme.destroy();
    // Should be able to init again
    expect(() => theme.init()).not.toThrow();
  });
});
