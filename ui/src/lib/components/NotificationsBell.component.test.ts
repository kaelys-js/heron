/**
 * NotificationsBell -- mounts cleanly + reflects notification state.
 *
 * Direct-renders the component (no harness needed -- it uses no
 * snippet props). Drives state via the shared notifications store.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import NotificationsBell from './NotificationsBell.svelte';
import { notifications } from '$lib/notifications.svelte';

// On mount NotificationsBell calls notifications.init(), whose connect() is
// fire-and-forget (`void this.connect()`): it does `await import(
// './client/sse-client')` then opens a live `/api/stream` EventSource. In a
// real-browser component test that async work resolves on a microtask AFTER
// render() returns, so the module-serving / network route it triggers races
// test teardown -- the Playwright provider then double-fulfills a route that
// is already handled and throws "route.fulfill: Route is already handled!"
// (intermittently -- ~1 run in 3 locally). These tests only verify rendering,
// so we neutralise init()/destroy() for the whole file. The SSE wiring itself
// is covered by the notifications store + sse-client unit tests.
const realInit = notifications.init.bind(notifications);
const realDestroy = notifications.destroy.bind(notifications);

describe('notificationsBell', () => {
  beforeAll(() => {
    notifications.init = () => {};
    notifications.destroy = () => {};
  });

  afterAll(() => {
    notifications.init = realInit;
    notifications.destroy = realDestroy;
  });

  beforeEach(() => {
    notifications.events.length = 0;
    notifications.unreadIds = new Set();
    notifications.connected = 'open';
  });

  afterEach(() => {
    notifications.events.length = 0;
    notifications.unreadIds = new Set();
    notifications.connected = 'open';
  });

  it('mounts without throwing on a fresh install (zero events)', () => {
    expect(() => render(NotificationsBell)).not.toThrow();
  });

  it('renders a trigger button into the DOM', () => {
    const { container } = render(NotificationsBell);
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
  });

  it('mounts when there are unread events', () => {
    notifications.events.push({
      id: 'e1',
      source: 'scan',
      title: 'Scan complete',
      message: '5 new jobs',
      ts: Date.now(),
      level: 'info',
      category: 'task',
      read: false,
    });
    expect(() => render(NotificationsBell)).not.toThrow();
  });

  // R6: the store keeps technical diagnostics in events[] (so a future
  // diagnostics view can read them), but the bell is a PRODUCT alert surface.
  // The unread badge -- the only always-visible part of the bell -- must count
  // product events only. A technical diagnostic (category 'system'/'api', no
  // explicit kind) sitting unread in the feed must NOT light the bell.
  it('unread badge counts product events only, not technical diagnostics', () => {
    notifications.events.push(
      {
        // technical: a 5xx-style diagnostic on the system category.
        id: 'tech',
        source: 'sveltekit',
        title: 'Internal Error 500',
        ts: Date.now(),
        level: 'error',
        category: 'system',
      },
      {
        // product: a task event the user acts on.
        id: 'prod',
        source: 'scan',
        title: 'Scan complete',
        ts: Date.now(),
        level: 'success',
        category: 'task',
      },
    );
    // Both unread in the store.
    notifications.unreadIds = new Set(['tech', 'prod']);

    const { container } = render(NotificationsBell);
    const trigger = container.querySelector('[data-testid="notifications-bell"]');
    expect(trigger).toBeTruthy();
    // Badge text is the product-only unread count (1), not 2.
    expect(trigger?.textContent?.replace(/\s+/g, '')).toContain('1');
    expect(trigger?.textContent?.replace(/\s+/g, '')).not.toContain('2');
  });

  it('badge is hidden when the only unread event is technical', () => {
    notifications.events.push({
      id: 'tech-only',
      source: 'sveltekit',
      title: 'render crash',
      ts: Date.now(),
      level: 'error',
      category: 'system',
    });
    notifications.unreadIds = new Set(['tech-only']);

    const { container } = render(NotificationsBell);
    // No unread badge element at all -- the {#if unreadCount > 0} guard is
    // false because the lone unread event is technical.
    const badge = container.querySelector('.bg-red-500');
    expect(badge).toBeFalsy();
  });

  it('mounts when there are mixed unread + read events', () => {
    notifications.events.push(
      {
        id: 'e1',
        source: 's',
        title: 't',
        message: 'm',
        ts: Date.now(),
        level: 'info',
        category: 'task',
        read: false,
      },
      {
        id: 'e2',
        source: 's',
        title: 't2',
        message: 'm2',
        ts: Date.now(),
        level: 'success',
        category: 'task',
        read: true,
      },
    );
    expect(() => render(NotificationsBell)).not.toThrow();
  });
});
