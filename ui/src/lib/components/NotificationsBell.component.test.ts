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
    notifications.connected = 'open';
  });

  afterEach(() => {
    notifications.events.length = 0;
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
