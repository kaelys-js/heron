/**
 * deep-links.test -- pure URL-resolution tests for tray subPath +
 * branded scheme handling.
 */
import { describe, it, expect } from 'vitest';
import { resolveDeepLink, resolveBrandedDeepLink } from './deep-links';

describe('resolveDeepLink', () => {
  it('joins a path with a baseUrl', () => {
    expect(resolveDeepLink('/pipeline', 'http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/pipeline',
    );
  });

  it('absolute subPath wins over baseUrl', () => {
    expect(resolveDeepLink('https://example.com/x', 'http://127.0.0.1:5173')).toBe(
      'https://example.com/x',
    );
  });

  it('handles trailing query strings', () => {
    expect(resolveDeepLink('/inbox?filter=open', 'http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/inbox?filter=open',
    );
  });

  it('handles fragments', () => {
    expect(resolveDeepLink('/inbox#issues', 'http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/inbox#issues',
    );
  });

  it('returns null on invalid base', () => {
    expect(resolveDeepLink('/x', 'not a base')).toBeNull();
  });

  it('returns null on completely invalid input', () => {
    expect(resolveDeepLink('not a url', 'not a base')).toBeNull();
  });

  it('handles empty subPath', () => {
    expect(resolveDeepLink('', 'http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173/');
  });

  it('handles HTTPS baseUrl', () => {
    expect(resolveDeepLink('/x', 'https://heron.app')).toBe('https://heron.app/x');
  });

  it('handles paths with multiple segments', () => {
    expect(resolveDeepLink('/profiles/default/cv', 'http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/profiles/default/cv',
    );
  });
});

describe('resolveBrandedDeepLink', () => {
  it('returns path for a valid heron:// URL', () => {
    expect(resolveBrandedDeepLink('heron://job/123', 'heron')).toBe('/job/123');
  });

  it('returns root path for bare scheme', () => {
    expect(resolveBrandedDeepLink('heron://', 'heron')).toBe('/');
  });

  it('returns null on wrong scheme', () => {
    expect(resolveBrandedDeepLink('https://example.com/x', 'heron')).toBeNull();
  });

  it('returns null on malformed URL', () => {
    expect(resolveBrandedDeepLink('not a url', 'heron')).toBeNull();
  });

  it('preserves query strings', () => {
    expect(resolveBrandedDeepLink('heron://job/123?source=tray', 'heron')).toBe(
      '/job/123?source=tray',
    );
  });

  it('preserves fragments', () => {
    expect(resolveBrandedDeepLink('heron://job/123#timeline', 'heron')).toBe('/job/123#timeline');
  });

  it('handles custom scheme name', () => {
    expect(resolveBrandedDeepLink('myapp://settings', 'myapp')).toBe('/settings');
  });

  it('rejects when scheme matches partially', () => {
    expect(resolveBrandedDeepLink('herons://x', 'heron')).toBeNull();
  });

  it('handles deep paths with host', () => {
    expect(resolveBrandedDeepLink('heron://settings/profile', 'heron')).toBe('/settings/profile');
  });
});
