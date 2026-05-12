/**
 * Central client-side notification store.
 * Subscribes to server SSE stream + tracks read state locally.
 * Polls /api/run for running tasks. Auto-reconnects SSE with exponential backoff.
 *
 * @module
 */

import type { ActivityEvent } from '$lib/types';
import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';
import { BRAND_EVENTS } from '$lib/client/brand';

function dispatchOpenNotifications(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BRAND_EVENTS.openNotifications));
  }
}

/**
 * Surface an arbitrary thrown value as a console log + activity-feed entry + toast.
 * Single source of truth so window listeners, SvelteKit handleError,
 * and <svelte:boundary onerror> all funnel through the same path.
 *
 * Mirror of `reportServerError` in `$lib/server/events`.
 */
export function reportClientError(
  source: string,
  title: string,
  err: unknown,
  extra: { message?: string } = {},
): void {
  const isError = err instanceof Error;
  const errMsg =
    extra.message ??
    (isError
      ? err.message
      : typeof err === 'string'
        ? err
        : (() => {
            try { return JSON.stringify(err); } catch { return String(err); }
          })());
  const stack = isError && err.stack ? err.stack.slice(0, 2000) : undefined;

  // Always log to console first, even if toast/notifications throw downstream.
  // eslint-disable-next-line no-console
  console.error('[' + source + ']', title, '—', errMsg);
  // eslint-disable-next-line no-console
  if (stack) console.error(stack);

  const ev: ActivityEvent = {
    id: 'client-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    level: 'error',
    category: 'system',
    source,
    title,
    message: errMsg,
    stack,
  };
  try {
    notifications.add(ev);
  } catch {}
  try {
    toast.error(title, {
      description: errMsg,
      duration: 10_000,
      action: {
        label: 'Details',
        onClick: () => dispatchOpenNotifications(),
      },
    });
  } catch {}
}

class NotificationStore {
  events = $state<ActivityEvent[]>([]);
  unreadIds = $state(new Set<string>());
  connected = $state<'connecting' | 'open' | 'error'>('connecting');
  hasEverConnected = $state(false);
  runningTasks = $state<string[]>([]);
  private es: EventSource | null = null;
  private autoToastSet = new Set<string>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private runningInterval: ReturnType<typeof setInterval> | null = null;

  init() {
    if (!browser || this.es) return;
    this.connect();
    this.refreshRunning();
    this.runningInterval = setInterval(() => this.refreshRunning(), 3000);
  }

  private connect() {
    if (!browser) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try { this.es?.close(); } catch {}
    this.es = new EventSource('/api/stream');
    this.connected = 'connecting';
    this.es.onopen = () => {
      this.connected = 'open';
      this.hasEverConnected = true;
      this.reconnectAttempt = 0;
    };
    this.es.onerror = () => {
      this.connected = 'error';
      this.scheduleReconnect();
    };
    this.es.onmessage = (e) => {
      try {
        const ev: ActivityEvent = JSON.parse(e.data);
        this.add(ev, { autoToast: true });
        // Refresh running tasks when a task event comes in
        if (ev.category === 'task') this.refreshRunning();
      } catch {}
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * Math.pow(2, this.reconnectAttempt));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  async refreshRunning() {
    if (!browser) return;
    try {
      const r = await fetch('/api/run');
      if (!r.ok) return;
      const data = await r.json();
      const list = Array.isArray(data?.running) ? data.running : (Array.isArray(data?.data?.running) ? data.data.running : []);
      this.runningTasks = list;
    } catch {}
  }

  destroy() {
    this.es?.close();
    this.es = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.runningInterval) clearInterval(this.runningInterval);
    this.reconnectTimer = null;
    this.runningInterval = null;
  }

  add(ev: ActivityEvent, opts: { autoToast?: boolean } = {}) {
    if (this.events.some((x) => x.id === ev.id)) return;
    this.events = [ev, ...this.events].slice(0, 200);
    this.unreadIds = new Set([...this.unreadIds, ev.id]);
    if (opts.autoToast && !this.autoToastSet.has(ev.id)) {
      this.autoToastSet.add(ev.id);
      this.fireToast(ev);
      // Dispatch `career-ops:notify` for PushNotificationsToggle. It
      // listens and fires an OS-level Notification when the tab is in
      // the background + the user has granted permission + the level is
      // enabled. Tightly scoped — only auto-toast events propagate so
      // backfill/replay events don't trigger a barrage.
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent(BRAND_EVENTS.notify, {
            detail: {
              level: ev.level,
              title: ev.title,
              message: ev.message,
              source: ev.source,
            },
          }));
        } catch {}
      }
    }
  }

  private fireToast(ev: ActivityEvent) {
    const desc = ev.message ? ev.message : undefined;
    if (ev.level === 'error') {
      toast.error(ev.title, {
        description: desc,
        duration: 10_000,
        action: {
          label: 'Details',
          onClick: () => dispatchOpenNotifications(),
        },
      });
    }
    else if (ev.level === 'warn') toast.warning(ev.title, { description: desc });
    else if (ev.level === 'success') toast.success(ev.title, { description: desc });
  }

  markRead(id: string) {
    if (!this.unreadIds.has(id)) return;
    const next = new Set(this.unreadIds);
    next.delete(id);
    this.unreadIds = next;
  }

  markAllRead() {
    this.unreadIds = new Set();
  }

  clear() {
    this.events = [];
    this.unreadIds = new Set();
    this.autoToastSet.clear();
    fetch('/api/notifications/clear', { method: 'POST' }).catch(() => {});
  }
}

export const notifications = new NotificationStore();
