/**
 * lib/utils — property-based tests via fast-check.
 *
 * Densifies the existing utils.test.ts cases by running 100+ random
 * inputs per property. Each `fc.assert` call counts as one Vitest case
 * but exercises 100 distinct generated inputs — high signal for
 * regression coverage.
 */
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { cn, formatRelativeTime, truncate, withMinDuration } from './utils';

describe('cn — properties', () => {
  it('idempotent on a single class name', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes(' ')),
        (s) => {
          expect(cn(s)).toBe(s);
        },
      ),
    );
  });

  it('always returns a string', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (xs) => {
        expect(typeof cn(...xs)).toBe('string');
      }),
    );
  });

  it('empty / falsy inputs produce empty string', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('', null, undefined, false), { maxLength: 10 }),
        (xs) => {
          expect(cn(...(xs as any[]))).toBe('');
        },
      ),
    );
  });
});

describe('formatRelativeTime — properties', () => {
  it('always returns a non-empty string', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000_000_000 }), (ts) => {
        const out = formatRelativeTime(ts);
        expect(typeof out).toBe('string');
        expect(out.length).toBeGreaterThan(0);
      }),
    );
  });

  it('past timestamps within 60s window all return "just now"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 59_000 }), (offsetMs) => {
        expect(formatRelativeTime(Date.now() - offsetMs)).toBe('just now');
      }),
    );
  });

  it('past 60s-3600s window all return "Nm ago"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 60_000, max: 3_599_000 }), (offsetMs) => {
        const out = formatRelativeTime(Date.now() - offsetMs);
        expect(out).toMatch(/^\d+m ago$/);
      }),
    );
  });
});

describe('truncate — properties', () => {
  it('result length ≤ limit', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 1000 }), (s, n) => {
        expect(truncate(s, n).length).toBeLessThanOrEqual(n);
      }),
    );
  });

  it('strings under limit are returned unchanged', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50 }), fc.integer({ min: 60, max: 1000 }), (s, n) => {
        expect(truncate(s, n)).toBe(s);
      }),
    );
  });

  it('strings over limit end with ellipsis', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 100, maxLength: 200 }),
        fc.integer({ min: 10, max: 50 }),
        (s, n) => {
          const out = truncate(s, n);
          if (s.length > n) {
            expect(out.endsWith('…')).toBe(true);
          }
        },
      ),
    );
  });

  it('empty string always returns empty string', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (n) => {
        expect(truncate('', n)).toBe('');
      }),
    );
  });
});

describe('withMinDuration — properties', () => {
  it('always resolves with the inner value (synchronous)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (value) => {
        const result = await withMinDuration(Promise.resolve(value), 1);
        expect(result).toEqual(value);
      }),
      { numRuns: 30 }, // fewer runs for async props
    );
  });

  it('always waits at least minMs (within 50ms tolerance)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 50 }), async (minMs) => {
        const start = performance.now();
        await withMinDuration(Promise.resolve('x'), minMs);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(minMs - 5); // ±5ms timer skew
      }),
      { numRuns: 10 }, // each test waits min ms, so few runs
    );
  });
});
