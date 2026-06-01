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
import { eventKind } from '$lib/report-routing';
import { report } from '$lib/client/error-reporter';

function dispatchOpenNotifications(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BRAND_EVENTS.openNotifications));
  }
}

/**
 * Report an arbitrary thrown value from the client. Thin wrapper over the
 * canonical reporter in `$lib/client/error-reporter` so SvelteKit
 * handleError and the <svelte:boundary onerror> boundaries funnel through
 * the one technical path -- console + POST /api/telemetry, and (because
 * technical is QUIET per $lib/report-routing) NO toast and NO bell entry.
 *
 * Signature + export preserved so existing call sites keep compiling. The
 * `extra.message` override is forwarded as the report context's `userAction`
 * so the server diagnostics row still carries the caller-shaped detail.
 *
 * Mirror of `reportServerError` in `$lib/server/events`.
 */
export function reportClientError(
  source: string,
  title: string,
  err: unknown,
  extra: { message?: string } = {},
): void {
  void report({
    err,
    level: 'error',
    kind: 'technical',
    context: { source, userAction: extra.message ?? title },
  });
}

class NotificationStore {
  events = $state<ActivityEvent[]>([]);
  unreadIds = $state(new Set<string>());
  connected = $state<'connecting' | 'open' | 'error'>('connecting');
  hasEverConnected = $state(false);
  runningTasks = $state<string[]>([]);
  /** Shared SSE client handle. The wrapper takes care of:
   *   - resolving `/api/stream` against getApiBase() (Capacitor-safe)
   *   - exponential backoff reconnect
   *   - reset-and-reconnect on net-status / online events
   *   - reset-and-reconnect on backend-URL changes
   *  See lib/client/sse-client.ts. */
  private sseClient: ReturnType<typeof import('./client/sse-client').createSseClient> | null = null;
  private autoToastSet = new Set<string>();
  private runningInterval: ReturnType<typeof setInterval> | null = null;

  init() {
    if (!browser || this.sseClient) {
      return;
    }
    void this.connect();
    this.refreshRunning();
    this.runningInterval = setInterval(() => this.refreshRunning(), 3000);
  }

  private async connect(): Promise<void> {
    if (!browser) {
      return;
    }
    const { createSseClient } = await import('./client/sse-client');
    // Idempotent -- earlier client (if any) is closed by sse-client's
    // internal teardown. Guard against double-init by clearing first.
    this.sseClient?.close();
    this.connected = 'connecting';
    this.sseClient = createSseClient('/api/stream', {
      onOpen: () => {
        this.connected = 'open';
        this.hasEverConnected = true;
      },
      onError: () => {
        this.connected = 'error';
      },
      onMessage: (e) => {
        try {
          const ev: ActivityEvent = JSON.parse(e.data);
          this.add(ev, { autoToast: true });
          // Refresh running tasks when a task event comes in
          if (ev.category === 'task') {
            this.refreshRunning();
          }
        } catch {}
      },
    });
  }

  async refreshRunning() {
    if (!browser) {
      return;
    }
    try {
      const r = await fetch('/api/run');
      if (!r.ok) {
        return;
      }
      const data = await r.json();
      const list = Array.isArray(data?.running)
        ? data.running
        : Array.isArray(data?.data?.running)
          ? data.data.running
          : [];
      this.runningTasks = list;
    } catch {}
  }

  destroy() {
    this.sseClient?.close();
    this.sseClient = null;
    if (this.runningInterval) {
      clearInterval(this.runningInterval);
    }
    this.runningInterval = null;
  }

  add(ev: ActivityEvent, opts: { autoToast?: boolean } = {}) {
    if (this.events.some((x) => x.id === ev.id)) {
      return;
    }
    this.events = [ev, ...this.events].slice(0, 200);
    this.unreadIds = new Set([...this.unreadIds, ev.id]);
    // Only PRODUCT events surface to the user (toast + OS notify). Technical
    // diagnostics are still STORED in events[] (so a diagnostics view can
    // read them) but stay quiet per $lib/report-routing -- a render crash
    // must not toast or wake the user like a failed apply.
    if (opts.autoToast && !this.autoToastSet.has(ev.id) && eventKind(ev) === 'product') {
      this.autoToastSet.add(ev.id);
      this.fireToast(ev);
      // Dispatch `heron:notify` for PushNotificationsToggle. It
      // listens and fires an OS-level Notification when the tab is in
      // the background + the user has granted permission + the level is
      // enabled. Tightly scoped -- only auto-toast events propagate so
      // backfill/replay events don't trigger a barrage.
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(
            new CustomEvent(BRAND_EVENTS.notify, {
              detail: {
                level: ev.level,
                title: ev.title,
                message: ev.message,
                source: ev.source,
              },
            }),
          );
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
    } else if (ev.level === 'warn') {
      toast.warning(ev.title, { description: desc });
    } else if (ev.level === 'success') {
      toast.success(ev.title, { description: desc });
    }
  }

  markRead(id: string) {
    if (!this.unreadIds.has(id)) {
      return;
    }
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
