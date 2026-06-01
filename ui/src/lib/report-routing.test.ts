/**
 * report-routing -- the single routing matrix that decides, for every
 * (kind, level) pair, where a report goes: which persistence sink, whether
 * it toasts, pings the bell, or fires an intrusive OS notification.
 *
 * WHY these assertions matter (not just WHAT they do):
 *   • Technical diagnostics must stay QUIET -- a render crash or an
 *     unhandled-rejection must never toast, ping the bell, or wake the user
 *     with an OS notification. They land in the diagnostics sink and nowhere
 *     else. If a future edit makes technical noisy, these tests fail.
 *   • Product warn/error is ACTIONABLE -- it opens an Issue row AND pings the
 *     bell AND (because it's intrusive-worthy) fires an OS notification.
 *   • Product info/success is informational -- it pings the bell but does NOT
 *     open an Issue row and does NOT fire an OS notification. A "new lead"
 *     should not nag you like a failed apply.
 *   • eventKind derivation: an explicit ev.kind always wins; otherwise the
 *     category maps (application/task/user -> product, system/api -> technical).
 *     This is what lets the legacy ActivityEvent bus (category, no kind) feed
 *     the same routing without rewriting every logEvent call site.
 */
import { describe, expect, it } from 'vitest';
import { routeReport, eventKind } from './report-routing';
import type { ActivityEvent } from '$lib/types';

describe('routeReport — product', () => {
  it('info pings the bell + toasts but opens no Issue and no OS notify', () => {
    expect(routeReport('product', 'info')).toEqual({
      persist: 'none',
      toast: true,
      bell: true,
      os: false,
    });
  });

  it('success pings the bell + toasts but opens no Issue and no OS notify', () => {
    expect(routeReport('product', 'success')).toEqual({
      persist: 'none',
      toast: true,
      bell: true,
      os: false,
    });
  });

  it('warn opens an Issue, toasts, pings the bell AND fires OS notify', () => {
    expect(routeReport('product', 'warn')).toEqual({
      persist: 'issues',
      toast: true,
      bell: true,
      os: true,
    });
  });

  it('error opens an Issue, toasts, pings the bell AND fires OS notify', () => {
    expect(routeReport('product', 'error')).toEqual({
      persist: 'issues',
      toast: true,
      bell: true,
      os: true,
    });
  });
});

describe('routeReport — technical (always quiet)', () => {
  for (const level of ['info', 'warn', 'error'] as const) {
    it(`${level} -> diagnostics sink, no toast / bell / OS`, () => {
      expect(routeReport('technical', level)).toEqual({
        persist: 'diagnostics',
        toast: false,
        bell: false,
        os: false,
      });
    });
  }
});

describe('eventKind — derivation', () => {
  function ev(over: Partial<ActivityEvent>): ActivityEvent {
    return {
      id: 'x',
      ts: 0,
      level: 'info',
      category: 'system',
      source: 's',
      title: 't',
      ...over,
    };
  }

  it('explicit kind wins over category mapping', () => {
    // A system-category event explicitly tagged product stays product --
    // the override is how a domain event reusing the system category opts in.
    expect(eventKind(ev({ category: 'system', kind: 'product' }))).toBe('product');
    expect(eventKind(ev({ category: 'application', kind: 'technical' }))).toBe('technical');
  });

  it('application / task / user categories map to product', () => {
    expect(eventKind(ev({ category: 'application' }))).toBe('product');
    expect(eventKind(ev({ category: 'task' }))).toBe('product');
    expect(eventKind(ev({ category: 'user' }))).toBe('product');
  });

  it('system / api categories map to technical', () => {
    expect(eventKind(ev({ category: 'system' }))).toBe('technical');
    expect(eventKind(ev({ category: 'api' }))).toBe('technical');
  });
});
