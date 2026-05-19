/**
 * lib/utils -- cn / formatRelativeTime / truncate / withMinDuration.
 *
 * Plain functions. No mocks beyond a stubbed clock for relative-time
 * cases that span "just now" vs "1m ago".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cn, formatRelativeTime, truncate, withMinDuration } from './utils';

describe('cn', () => {
  it('joins multiple class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops null + undefined inputs', () => {
    expect(cn('a', null, undefined, 'b')).toBe('a b');
  });

  it('handles arrays of class names', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('handles conditional object form', () => {
    expect(cn('a', { b: true, c: false, d: true })).toBe('a b d');
  });

  it('returns empty string when inputs collapse to nothing', () => {
    expect(cn('', null, undefined, false)).toBe('');
  });

  it('deduplicates conflicting tailwind classes (twMerge)', () => {
    // text-red-400 and text-blue-400 conflict; twMerge keeps the LAST.
    expect(cn('text-red-400', 'text-blue-400')).toBe('text-blue-400');
  });

  it('keeps non-conflicting tailwind utilities intact', () => {
    expect(cn('text-red-400', 'bg-blue-100', 'p-2')).toContain('text-red-400');
    expect(cn('text-red-400', 'bg-blue-100', 'p-2')).toContain('bg-blue-100');
    expect(cn('text-red-400', 'bg-blue-100', 'p-2')).toContain('p-2');
  });

  it('twMerge resolves p-2 vs px-4 correctly', () => {
    // p-2 sets both x and y padding; px-4 overrides x. Result: p-2 + px-4.
    const out = cn('p-2', 'px-4');
    expect(out).toBe('p-2 px-4');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for < 60s ago', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('just now');
  });

  it('rounds <1s to "just now"', () => {
    expect(formatRelativeTime(Date.now() - 100)).toBe('just now');
  });

  it('formats minutes', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe('5m ago');
  });

  it('formats hours', () => {
    expect(formatRelativeTime(Date.now() - 3 * 60 * 60_000)).toBe('3h ago');
  });

  it('formats days', () => {
    expect(formatRelativeTime(Date.now() - 5 * 24 * 60 * 60_000)).toBe('5d ago');
  });

  it('falls back to locale date past 30 days', () => {
    const out = formatRelativeTime(Date.now() - 60 * 24 * 60 * 60_000);
    // Locale string varies by environment -- assert shape, not exact value.
    expect(out).toMatch(/\d/);
    expect(out).not.toMatch(/ago/);
  });

  it('handles future timestamps gracefully (negative diff floors to "just now")', () => {
    // Math.floor(-30_000 / 1000) = -30, which is < 60, so "just now".
    expect(formatRelativeTime(Date.now() + 30_000)).toBe('just now');
  });

  it('boundary: exactly 60s ago crosses into "1m ago"', () => {
    expect(formatRelativeTime(Date.now() - 60_000)).toBe('1m ago');
  });

  it('boundary: exactly 60 minutes ago crosses into "1h ago"', () => {
    expect(formatRelativeTime(Date.now() - 60 * 60_000)).toBe('1h ago');
  });

  it('boundary: exactly 24 hours ago crosses into "1d ago"', () => {
    expect(formatRelativeTime(Date.now() - 24 * 60 * 60_000)).toBe('1d ago');
  });
});

describe('truncate', () => {
  it('returns empty string for falsy input', () => {
    expect(truncate('')).toBe('');
  });

  it('returns input unchanged when under limit', () => {
    expect(truncate('hello', 60)).toBe('hello');
  });

  it('truncates with ellipsis when over limit', () => {
    expect(truncate('a'.repeat(70), 10)).toBe('aaaaaaaaa…');
    expect(truncate('a'.repeat(70), 10)).toHaveLength(10);
  });

  it('uses the default limit of 60', () => {
    const long = 'a'.repeat(100);
    expect(truncate(long)).toHaveLength(60);
  });
});

describe('withMinDuration', () => {
  it('resolves with the promise value', async () => {
    const result = await withMinDuration(Promise.resolve('hello'), 10);
    expect(result).toBe('hello');
  });

  it('waits at least minMs even if the promise resolves instantly', async () => {
    const start = performance.now();
    await withMinDuration(Promise.resolve('x'), 50);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45); // some slack for timer skew
  });

  it('does NOT extend past natural duration when promise already slow', async () => {
    const slow = new Promise<string>((r) => setTimeout(() => r('done'), 100));
    const start = performance.now();
    await withMinDuration(slow, 20);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(95);
    expect(elapsed).toBeLessThan(200);
  });

  it('propagates promise rejection without extending', async () => {
    await expect(withMinDuration(Promise.reject(new Error('boom')), 100)).rejects.toThrow('boom');
  });

  it('uses default 450ms when minMs omitted', async () => {
    const start = performance.now();
    await withMinDuration(Promise.resolve('x'));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(445);
  });
});
