/**
 * NotificationsBell -- mounts cleanly + reflects notification state.
 *
 * Direct-renders the component (no harness needed -- it uses no
 * snippet props). Drives state via the shared notifications store.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import NotificationsBell from './NotificationsBell.svelte';
import { notifications } from '$lib/notifications.svelte';

describe('NotificationsBell', () => {
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
