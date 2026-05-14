/**
 * lib/utils — dense edge-case matrix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cn, formatRelativeTime, truncate, withMinDuration } from './utils';

describe('cn — combinations', () => {
  it.each([
    [['a'], 'a'],
    [['a', 'b'], 'a b'],
    [['a', 'b', 'c'], 'a b c'],
    [['a', '', 'b'], 'a b'],
    [['a', null, 'b'], 'a b'],
    [['a', undefined, 'b'], 'a b'],
    [['a', false, 'b'], 'a b'],
    [['a', false, null, undefined, 'b'], 'a b'],
    [[[]], ''],
    [[['a']], 'a'],
    [[['a', 'b']], 'a b'],
    [[['a'], 'b'], 'a b'],
    [[{ a: true }], 'a'],
    [[{ a: true, b: false }], 'a'],
    [[{ a: true, b: true }], 'a b'],
    [[{}], ''],
  ] as const)('cn(%o) → "%s"', (input, expected) => {
    expect(cn(...(input as unknown as any[]))).toBe(expected);
  });
});

describe('cn — twMerge dedup of conflicting utilities', () => {
  it.each([
    [['text-red-400', 'text-blue-400'], 'text-blue-400'],
    [['bg-red-100', 'bg-blue-100'], 'bg-blue-100'],
    [['p-2', 'p-4'], 'p-4'],
    [['p-2', 'px-4'], 'p-2 px-4'],
    [['mt-2', 'mt-4'], 'mt-4'],
    [['mt-2', 'mb-4'], 'mt-2 mb-4'],
  ] as const)('cn(%o) → "%s"', (input, expected) => {
    expect(cn(...input)).toBe(expected);
  });
});

describe('formatRelativeTime — banding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    [0, 'just now'],
    [1, 'just now'],
    [1_000, 'just now'],
    [10_000, 'just now'],
    [30_000, 'just now'],
    [59_000, 'just now'],
  ])('%i ms ago → "%s"', (offset, expected) => {
    expect(formatRelativeTime(Date.now() - offset)).toBe(expected);
  });

  it.each([
    [60_000, '1m ago'],
    [120_000, '2m ago'],
    [600_000, '10m ago'],
    [1_800_000, '30m ago'],
    [3_540_000, '59m ago'],
  ])('%i ms ago → "%s"', (offset, expected) => {
    expect(formatRelativeTime(Date.now() - offset)).toBe(expected);
  });

  it.each([
    [3_600_000, '1h ago'],
    [7_200_000, '2h ago'],
    [21_600_000, '6h ago'],
    [43_200_000, '12h ago'],
    [82_800_000, '23h ago'],
  ])('%i ms ago → "%s"', (offset, expected) => {
    expect(formatRelativeTime(Date.now() - offset)).toBe(expected);
  });

  it.each([
    [86_400_000, '1d ago'],
    [172_800_000, '2d ago'],
    [604_800_000, '7d ago'],
    [2_505_600_000, '29d ago'],
  ])('%i ms ago → "%s"', (offset, expected) => {
    expect(formatRelativeTime(Date.now() - offset)).toBe(expected);
  });
});

describe('truncate — boundary cases', () => {
  it.each([
    ['', 60, ''],
    ['a', 60, 'a'],
    ['hello', 5, 'hello'], // length === limit → unchanged (not strict >)
    ['hello', 6, 'hello'],
    ['hello world', 5, 'hell…'],
    ['hello world', 10, 'hello wor…'],
    ['hello world', 11, 'hello world'],
    ['hello world', 100, 'hello world'],
    ['a'.repeat(100), 10, 'aaaaaaaaa…'],
    ['a'.repeat(60), 60, 'a'.repeat(60)],
    ['a'.repeat(61), 60, 'a'.repeat(59) + '…'],
  ])('truncate("%s", %i) → "%s"', (input, limit, expected) => {
    expect(truncate(input, limit)).toBe(expected);
  });
});

describe('withMinDuration — timing accuracy', () => {
  it.each([10, 20, 50, 100, 200])('minMs=%i adds at least minMs - 10', async (minMs) => {
    const start = performance.now();
    await withMinDuration(Promise.resolve('x'), minMs);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(minMs - 10);
  });
});
