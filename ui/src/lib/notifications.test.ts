/**
 * lib/notifications -- central activity-feed store.
 *
 * Tests cover: add() dedup + cap at 200, autoToast event dispatch GATED on
 * product kind (R6-bell -- technical stays quiet), markRead / markAllRead,
 * clear, reportClientError now delegating to the canonical technical reporter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND_EVENTS } from '$lib/client/brand';

const toastCalls = { error: [] as any[], warning: [] as any[], success: [] as any[] };
vi.mock('svelte-sonner', () => ({
  toast: {
    error: (msg: any, opts?: any) => toastCalls.error.push({ msg, opts }),
    warning: (msg: any, opts?: any) => toastCalls.warning.push({ msg, opts }),
    success: (msg: any, opts?: any) => toastCalls.success.push({ msg, opts }),
  },
}));
vi.mock('$app/environment', () => ({ browser: true }));

// reportClientError is now a thin wrapper over error-reporter's report().
// Mock report so we can assert delegation (and confirm reportClientError no
// longer touches the toast/bell directly).
const reportMock = vi.fn(async (_input: any): Promise<void> => {});
vi.mock('$lib/client/error-reporter', () => ({
  report: (input: any) => reportMock(input),
}));

const { notifications, reportClientError } = await import('./notifications.svelte');

/** Default factory makes a PRODUCT-kind event (category 'application') so the
 *  user-facing autoToast path is exercised; pass `category: 'system'` (or
 *  kind: 'technical') to test the quiet path. */
function makeEvent(over: Partial<any> = {}): any {
  return {
    id: `ev-${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    level: 'info',
    category: 'application',
    source: 'test',
    title: 'Hello',
    message: 'World',
    ...over,
  };
}

describe('notifications.add', () => {
  beforeEach(() => {
    notifications.clear();
    toastCalls.error.length = 0;
    toastCalls.warning.length = 0;
    toastCalls.success.length = 0;
  });

  it('pushes new events to the head of the list', () => {
    notifications.add(makeEvent({ id: 'a' }));
    notifications.add(makeEvent({ id: 'b' }));
    expect(notifications.events[0].id).toBe('b');
    expect(notifications.events[1].id).toBe('a');
  });

  it('dedupes by id', () => {
    notifications.add(makeEvent({ id: 'dup' }));
    notifications.add(makeEvent({ id: 'dup' }));
    expect(notifications.events.length).toBe(1);
  });

  it('caps the list at 200 events', () => {
    for (let i = 0; i < 250; i++) {
      notifications.add(makeEvent({ id: `e${i}` }));
    }
    expect(notifications.events.length).toBe(200);
  });

  it('marks new events as unread', () => {
    notifications.add(makeEvent({ id: 'unread-1' }));
    expect(notifications.unreadIds.has('unread-1')).toBe(true);
  });

  it('autoToast fires a toast', () => {
    notifications.add(makeEvent({ id: 't', level: 'error', title: 'Err' }), { autoToast: true });
    expect(toastCalls.error.length).toBe(1);
    expect(toastCalls.error[0].msg).toBe('Err');
  });

  it('autoToast routes warn level to toast.warning', () => {
    notifications.add(makeEvent({ id: 't', level: 'warn', title: 'Warn' }), { autoToast: true });
    expect(toastCalls.warning.length).toBe(1);
  });

  it('autoToast routes success level to toast.success', () => {
    notifications.add(makeEvent({ id: 't', level: 'success', title: 'Yay' }), { autoToast: true });
    expect(toastCalls.success.length).toBe(1);
  });

  it('autoToast does NOT fire for info level', () => {
    notifications.add(makeEvent({ id: 't', level: 'info' }), { autoToast: true });
    expect(toastCalls.error.length + toastCalls.warning.length + toastCalls.success.length).toBe(0);
  });

  it('autoToast does NOT fire twice for the same id', () => {
    notifications.add(makeEvent({ id: 'once', level: 'error' }), { autoToast: true });
    notifications.add(makeEvent({ id: 'once', level: 'error' }), { autoToast: true });
    expect(toastCalls.error.length).toBe(1);
  });

  it('autoToast dispatches a heron:notify CustomEvent', () => {
    const fired: any[] = [];
    const h = (e: Event) => fired.push((e as CustomEvent).detail);
    window.addEventListener(BRAND_EVENTS.notify, h);
    notifications.add(makeEvent({ id: 'cev', level: 'error', title: 'Err' }), { autoToast: true });
    expect(fired.length).toBe(1);
    expect(fired[0].level).toBe('error');
    window.removeEventListener(BRAND_EVENTS.notify, h);
  });

  it('does NOT dispatch heron:notify when autoToast is false', () => {
    const fired: any[] = [];
    const h = (e: Event) => fired.push(e);
    window.addEventListener(BRAND_EVENTS.notify, h);
    notifications.add(makeEvent({ id: 'silent' }));
    expect(fired.length).toBe(0);
    window.removeEventListener(BRAND_EVENTS.notify, h);
  });
});

describe('notifications.add — R6-bell kind gating', () => {
  // WHY: technical diagnostics (uncaught error, render crash, 5xx) belong in
  // the feed for a diagnostics view but must NEVER toast or fire an OS
  // notification -- only PRODUCT events (a failed apply, a dead posting) earn
  // that intrusion. The gate is eventKind(ev) === 'product'.
  beforeEach(() => {
    notifications.clear();
    toastCalls.error.length = 0;
    toastCalls.warning.length = 0;
    toastCalls.success.length = 0;
  });

  it('a PRODUCT error event fires a toast + heron:notify', () => {
    const fired: any[] = [];
    const h = (e: Event) => fired.push((e as CustomEvent).detail);
    window.addEventListener(BRAND_EVENTS.notify, h);
    notifications.add(
      makeEvent({ id: 'prod-err', level: 'error', category: 'application', title: 'Apply failed' }),
      { autoToast: true },
    );
    expect(toastCalls.error.length).toBe(1);
    expect(fired.length).toBe(1);
    window.removeEventListener(BRAND_EVENTS.notify, h);
  });

  it('a TECHNICAL error event fires NEITHER toast NOR heron:notify', () => {
    const fired: any[] = [];
    const h = (e: Event) => fired.push((e as CustomEvent).detail);
    window.addEventListener(BRAND_EVENTS.notify, h);
    notifications.add(
      makeEvent({ id: 'tech-err', level: 'error', category: 'system', title: 'Uncaught error' }),
      { autoToast: true },
    );
    expect(toastCalls.error.length).toBe(0);
    expect(fired.length).toBe(0);
    window.removeEventListener(BRAND_EVENTS.notify, h);
  });

  it('still STORES a technical event in the feed (diagnostics view reads it)', () => {
    notifications.add(makeEvent({ id: 'tech-stored', category: 'system' }), { autoToast: true });
    expect(notifications.events.some((e) => e.id === 'tech-stored')).toBe(true);
  });

  it('an explicit kind override wins -- product kind on a system category toasts', () => {
    notifications.add(
      makeEvent({ id: 'kind-override', level: 'warn', category: 'system', kind: 'product' }),
      { autoToast: true },
    );
    expect(toastCalls.warning.length).toBe(1);
  });
});

describe('notifications.markRead', () => {
  beforeEach(() => notifications.clear());

  it('removes the id from unreadIds', () => {
    notifications.add(makeEvent({ id: 'r' }));
    notifications.markRead('r');
    expect(notifications.unreadIds.has('r')).toBe(false);
  });

  it('is a no-op for unknown ids', () => {
    notifications.add(makeEvent({ id: 'r' }));
    notifications.markRead('not-here');
    expect(notifications.unreadIds.has('r')).toBe(true);
  });

  it('preserves other unread ids', () => {
    notifications.add(makeEvent({ id: 'a' }));
    notifications.add(makeEvent({ id: 'b' }));
    notifications.markRead('a');
    expect(notifications.unreadIds.has('a')).toBe(false);
    expect(notifications.unreadIds.has('b')).toBe(true);
  });
});

describe('notifications.markAllRead', () => {
  beforeEach(() => notifications.clear());

  it('clears the entire unreadIds set', () => {
    notifications.add(makeEvent({ id: 'a' }));
    notifications.add(makeEvent({ id: 'b' }));
    notifications.markAllRead();
    expect(notifications.unreadIds.size).toBe(0);
  });

  it('keeps events visible (only marks read)', () => {
    notifications.add(makeEvent({ id: 'a' }));
    notifications.markAllRead();
    expect(notifications.events.length).toBe(1);
  });
});

describe('notifications.clear', () => {
  beforeEach(() => notifications.clear());

  it('empties the events list', () => {
    notifications.add(makeEvent({ id: 'a' }));
    notifications.clear();
    expect(notifications.events.length).toBe(0);
  });

  it('empties unreadIds', () => {
    notifications.add(makeEvent({ id: 'a' }));
    notifications.clear();
    expect(notifications.unreadIds.size).toBe(0);
  });

  it('resets autoToastSet (next add can toast again)', () => {
    notifications.add(makeEvent({ id: 'a', level: 'error' }), { autoToast: true });
    notifications.clear();
    toastCalls.error.length = 0;
    notifications.add(makeEvent({ id: 'a', level: 'error' }), { autoToast: true });
    expect(toastCalls.error.length).toBe(1);
  });
});

describe('reportClientError — thin technical wrapper', () => {
  // WHY: reportClientError used to toast + add to the bell directly. Under the
  // unified system it must delegate to error-reporter's report() as a
  // TECHNICAL report -- which is QUIET. So it must NOT toast and must NOT add
  // a bell row itself; it only forwards to report().
  beforeEach(() => {
    notifications.clear();
    toastCalls.error.length = 0;
    reportMock.mockClear();
  });

  it('delegates to report() with kind:technical, level:error', () => {
    reportClientError('test', 'Boom', new Error('oops'));
    expect(reportMock).toHaveBeenCalledTimes(1);
    const arg = reportMock.mock.calls[0][0];
    expect(arg.kind).toBe('technical');
    expect(arg.level).toBe('error');
    expect(arg.context.source).toBe('test');
  });

  it('does NOT toast and does NOT add a bell row (technical = quiet)', () => {
    reportClientError('test', 'Boom', new Error('oops'));
    expect(toastCalls.error.length).toBe(0);
    expect(notifications.events.length).toBe(0);
  });

  it('forwards the original thrown value to report() for coercion there', () => {
    reportClientError('test', 'ObjErr', { code: 42 });
    expect(reportMock.mock.calls[0][0].err).toEqual({ code: 42 });
  });

  it('forwards extra.message as the report context userAction', () => {
    reportClientError('test', 'X', new Error('real'), { message: 'override' });
    expect(reportMock.mock.calls[0][0].context.userAction).toBe('override');
  });

  it('falls back to the title for userAction when no extra.message', () => {
    reportClientError('test', 'TitleAsAction', new Error('e'));
    expect(reportMock.mock.calls[0][0].context.userAction).toBe('TitleAsAction');
  });
});
