/** fingerprint -- stable error grouping key + read-side grouping.
 *
 *  WHY: grouping recurring errors needs a key that's STABLE across occurrences.
 *  The hard case (and the bug these pin): error titles carry per-occurrence noise
 *  (a `· ref <uuid>`) and stacks carry shifting line numbers, so a naive
 *  title/line hash would make every occurrence unique and grouping useless. The
 *  fingerprint must ignore both and still separate genuinely-different errors.
 */
import { describe, expect, it } from 'vitest';
import { fingerprint, groupByFingerprint } from './fingerprint';
import type { ActivityEvent } from '$lib/types';

describe('fingerprint', () => {
  it('is stable across occurrences that differ only in the ref/title + line numbers', () => {
    const a = fingerprint(
      'server',
      '[500] /x · ref aaaaaaaa-1111',
      'Error: boom\n  at f (~/a.ts:12:5)',
    );
    const b = fingerprint(
      'server',
      '[500] /x · ref bbbbbbbb-2222',
      'Error: boom\n  at f (~/a.ts:88:9)',
    );
    expect(a).toBe(b); // same source + same frame (path), differing ref + line -> SAME group
  });

  it('separates different stacks (different crash sites do not collapse)', () => {
    const a = fingerprint('server', 't', 'Error\n  at f (~/a.ts:1:1)');
    const b = fingerprint('server', 't', 'Error\n  at g (~/b.ts:1:1)');
    expect(a).not.toBe(b);
  });

  it('separates different sources', () => {
    expect(fingerprint('db', 't')).not.toBe(fingerprint('auth', 't'));
  });

  it('falls back to source+title when there is no stack', () => {
    expect(fingerprint('s', 'same')).toBe(fingerprint('s', 'same'));
    expect(fingerprint('s', 'one')).not.toBe(fingerprint('s', 'two'));
  });

  it('is a short stable hex key', () => {
    expect(fingerprint('s', 't', 'x')).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('groupByFingerprint', () => {
  const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({
    id: Math.random().toString(36).slice(2),
    ts: 0,
    level: 'error',
    category: 'system',
    source: 's',
    title: 't',
    ...over,
  });

  it('counts occurrences per fingerprint + tracks the latest timestamp', () => {
    const groups = groupByFingerprint([
      ev({ fingerprint: 'aaa', ts: 1 }),
      ev({ fingerprint: 'aaa', ts: 5 }),
      ev({ fingerprint: 'bbb', ts: 3 }),
    ]);
    const byFp = Object.fromEntries(groups.map((g) => [g.fingerprint, g]));
    expect(byFp.aaa.count).toBe(2);
    expect(byFp.aaa.lastTs).toBe(5);
    expect(byFp.bbb.count).toBe(1);
  });

  it('skips events without a fingerprint (info/success never group)', () => {
    const groups = groupByFingerprint([ev({ level: 'info', fingerprint: undefined })]);
    expect(groups).toEqual([]);
  });

  it('orders the most-recently-active group first', () => {
    const groups = groupByFingerprint([
      ev({ fingerprint: 'old', ts: 1 }),
      ev({ fingerprint: 'new', ts: 100 }),
    ]);
    expect(groups[0].fingerprint).toBe('new');
  });
});
