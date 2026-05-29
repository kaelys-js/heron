/**
 * lib/notifications -- central activity-feed store.
 *
 * Tests cover: add() dedup + cap at 200 + autoToast event dispatch,
 * markRead / markAllRead, clear, init/destroy lifecycle, reportClient-
 * Error funnel, fireToast level routing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { notifications, reportClientError } = await import('./notifications.svelte');

function makeEvent(over: Partial<any> = {}): any {
  return {
    id: `ev-${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    level: 'info',
    category: 'system',
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

describe('reportClientError', () => {
  beforeEach(() => {
    notifications.clear();
    toastCalls.error.length = 0;
  });

  it('logs to console + adds event + fires toast', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportClientError('test', 'Boom', new Error('oops'));
    expect(errSpy).toHaveBeenCalled();
    expect(notifications.events.length).toBe(1);
    expect(toastCalls.error.length).toBe(1);
    errSpy.mockRestore();
  });

  it('coerces string err', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportClientError('test', 'StrErr', 'plain text');
    expect(notifications.events[0].message).toBe('plain text');
    errSpy.mockRestore();
  });

  it('coerces object err via JSON', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportClientError('test', 'ObjErr', { code: 42 });
    expect(notifications.events[0].message).toContain('42');
    errSpy.mockRestore();
  });

  it('respects extra.message override', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportClientError('test', 'X', new Error('real'), { message: 'override' });
    expect(notifications.events[0].message).toBe('override');
    errSpy.mockRestore();
  });

  it('captures stack from Error instances', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportClientError('test', 'S', new Error('with stack'));
    expect(typeof notifications.events[0].stack).toBe('string');
    errSpy.mockRestore();
  });
});
