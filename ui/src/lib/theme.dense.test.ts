/**
 * lib/theme -- dense mode + toggle + persist scenarios.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND_STORAGE_KEYS } from '$lib/client/brand';

vi.mock('$app/environment', () => ({ browser: true }));

const { theme } = await import('./theme.svelte');

const MODES = ['light', 'dark', 'system'] as const;

describe('theme.set — every mode persists', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    theme.destroy();
    theme.mode = 'system';
  });
  afterEach(() => theme.destroy());

  it.each(MODES)('set("%s") persists to localStorage', (m) => {
    theme.set(m);
    expect(theme.mode).toBe(m);
    expect(localStorage.getItem(BRAND_STORAGE_KEYS.theme)).toBe(m);
  });
});

describe('theme.set — mode round-trip after destroy', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    theme.destroy();
    theme.mode = 'system';
  });

  it.each(MODES)('set %s → destroy → init reads %s', (m) => {
    theme.set(m);
    theme.destroy();
    theme.init();
    expect(theme.mode).toBe(m);
  });
});

describe('theme.toggle — every starting state', () => {
  beforeEach(() => {
    theme.destroy();
    theme.mode = 'system';
    theme.resolved = 'dark';
  });

  it.each([
    ['dark', 'light'],
    ['light', 'dark'],
  ] as const)('toggle from resolved=%s → mode=%s', (start, end) => {
    theme.resolved = start;
    theme.toggle();
    expect(theme.mode).toBe(end);
  });
});

describe('theme.init — corrupt localStorage values', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    theme.destroy();
    theme.mode = 'system';
  });

  it.each([
    'invalid',
    '',
    '   ',
    'LIGHT', // uppercase -- should NOT match
    'foo',
    '123',
    'null',
    'undefined',
  ])('stored="%s" → falls back to system', (stored) => {
    localStorage.setItem(BRAND_STORAGE_KEYS.theme, stored);
    theme.init();
    expect(theme.mode).toBe('system');
  });
});

describe('theme.init — valid stored values', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    theme.destroy();
    theme.mode = 'system';
  });

  it.each(['light', 'dark'])('stored="%s" → restored', (stored) => {
    localStorage.setItem(BRAND_STORAGE_KEYS.theme, stored);
    theme.init();
    expect(theme.mode).toBe(stored);
  });

  // 'system' is the default -- storing it doesn't change anything but
  // shouldn't cause a regression.
  it('stored="system" — init() honours it', () => {
    localStorage.setItem(BRAND_STORAGE_KEYS.theme, 'system');
    theme.init();
    expect(theme.mode).toBe('system');
  });
});

describe('theme.destroy — idempotent', () => {
  it.each([1, 3, 5])('destroying %i times is safe', (n) => {
    for (let i = 0; i < n; i++) {
      expect(() => theme.destroy()).not.toThrow();
    }
  });
});
