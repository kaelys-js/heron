/**
 * lib/notifications -- dense scenarios for the activity-feed store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('svelte-sonner', () => ({
  toast: { error: () => {}, warning: () => {}, success: () => {} },
}));
vi.mock('$app/environment', () => ({ browser: true }));

const { notifications } = await import('./notifications.svelte');

function ev(over: Partial<any> = {}) {
  return {
    id: `ev-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    level: 'info' as const,
    category: 'system' as const,
    source: 'test',
    title: 'X',
    message: 'm',
    ...over,
  };
}

describe('notifications.add — every level', () => {
  beforeEach(() => notifications.clear());
  it.each(['info', 'warn', 'error', 'success'])('level %s adds without throwing', (level) => {
    notifications.add(ev({ level: level as any }));
    expect(notifications.events.length).toBe(1);
    expect(notifications.events[0].level).toBe(level);
  });
});

describe('notifications.add — every category', () => {
  beforeEach(() => notifications.clear());
  it.each(['task', 'api', 'application', 'system', 'user'])('category %s', (cat) => {
    notifications.add(ev({ category: cat as any }));
    expect(notifications.events[0].category).toBe(cat);
  });
});

describe('notifications.add — bulk insert', () => {
  beforeEach(() => notifications.clear());
  it.each([1, 5, 10, 50, 100, 199, 200])('inserts %i events without exceeding cap', (n) => {
    for (let i = 0; i < n; i++) {
      notifications.add(ev({ id: `bulk-${i}` }));
    }
    expect(notifications.events.length).toBe(Math.min(n, 200));
  });

  it.each([201, 250, 500, 1000])('caps at 200 when over (%i input)', (n) => {
    for (let i = 0; i < n; i++) {
      notifications.add(ev({ id: `over-${i}` }));
    }
    expect(notifications.events.length).toBe(200);
  });
});

describe('notifications.markRead — bulk', () => {
  beforeEach(() => notifications.clear());
  it.each([1, 5, 10, 50])('marks %i read', (n) => {
    for (let i = 0; i < n; i++) {
      notifications.add(ev({ id: `r-${i}` }));
    }
    expect(notifications.unreadIds.size).toBe(n);
    for (let i = 0; i < n; i++) {
      notifications.markRead(`r-${i}`);
    }
    expect(notifications.unreadIds.size).toBe(0);
  });
});

describe('notifications.markAllRead — at various counts', () => {
  beforeEach(() => notifications.clear());
  it.each([0, 1, 5, 50, 200])('clears unreadIds when %i pending', (n) => {
    for (let i = 0; i < n; i++) {
      notifications.add(ev({ id: `a-${i}` }));
    }
    notifications.markAllRead();
    expect(notifications.unreadIds.size).toBe(0);
  });
});

describe('notifications.clear — preserves shape', () => {
  it.each([
    0, 1, 10, 100, 200,
  ])('after clear with %i events, events=[] and unreadIds.size=0', (n) => {
    notifications.clear();
    for (let i = 0; i < n; i++) {
      notifications.add(ev({ id: `c-${i}` }));
    }
    notifications.clear();
    expect(notifications.events).toEqual([]);
    expect(notifications.unreadIds.size).toBe(0);
  });
});

describe('notifications.add — dedup by id under repeated inserts', () => {
  beforeEach(() => notifications.clear());
  it.each([1, 2, 5, 10])('inserts same id %i times → events.length=1', (n) => {
    for (let i = 0; i < n; i++) {
      notifications.add(ev({ id: 'dup' }));
    }
    expect(notifications.events.length).toBe(1);
  });
});
