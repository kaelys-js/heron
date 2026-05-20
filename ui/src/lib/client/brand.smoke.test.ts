/**
 * brand.smoke.test -- the generated brand.ts (from apply-brand.mjs)
 * exports two helpers (jobDeepLink, deepLink) plus a handful of const
 * objects (BRAND, BRAND_EVENTS, etc.). Pin them so a brand regen that
 * accidentally drops a key breaks loudly.
 */
import { describe, expect, it } from 'vitest';
import {
  BRAND,
  BRAND_EVENTS,
  BRAND_STORAGE_PREFIX,
  BRAND_STORAGE_KEYS,
  jobDeepLink,
  deepLink,
} from './brand';

describe('BRAND constants', () => {
  it('exports BRAND with required core fields', () => {
    expect(BRAND.name).toBeTruthy();
    expect(BRAND.displayName).toBeTruthy();
    expect(BRAND.bundleId).toBeTruthy();
    expect(BRAND.urlScheme).toBeTruthy();
  });

  it('exports BRAND_EVENTS', () => {
    expect(typeof BRAND_EVENTS).toBe('object');
  });

  it('BRAND_STORAGE_PREFIX equals BRAND.name', () => {
    expect(BRAND_STORAGE_PREFIX).toBe(BRAND.name);
  });

  it('BRAND_STORAGE_KEYS is a non-empty object', () => {
    expect(typeof BRAND_STORAGE_KEYS).toBe('object');
    expect(Object.keys(BRAND_STORAGE_KEYS).length).toBeGreaterThan(0);
  });
});

describe('jobDeepLink', () => {
  it('builds a deep link for a job id under the brand URL scheme', () => {
    const link = jobDeepLink('abc123');
    expect(link).toContain(BRAND.urlScheme + '://');
    expect(link).toContain('abc123');
  });

  it('handles empty job id without crashing', () => {
    expect(typeof jobDeepLink('')).toBe('string');
  });

  it('returns the same link shape across different ids', () => {
    const a = jobDeepLink('a');
    const b = jobDeepLink('bb');
    expect(a.startsWith(BRAND.urlScheme + '://')).toBe(true);
    expect(b.startsWith(BRAND.urlScheme + '://')).toBe(true);
  });
});

describe('deepLink', () => {
  it('builds a deep link for an arbitrary route', () => {
    const link = deepLink('/inbox');
    expect(link).toContain(BRAND.urlScheme + '://');
    expect(link).toContain('inbox');
  });

  it('handles routes with query strings', () => {
    const link = deepLink('/job/123?from=email');
    expect(link).toContain('123');
  });

  it('handles a bare route without leading slash', () => {
    expect(typeof deepLink('inbox')).toBe('string');
  });
});
