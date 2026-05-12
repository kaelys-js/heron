/**
 * sse-notifications-bridge — wire the existing /api/notifications SSE
 * stream into the unified `notify()` function so OS notifications fire
 * on every supported platform (Web, Electron, iOS Capacitor).
 *
 * The existing pipeline:
 *
 *   Server                  Client (web)
 *   ──────                  ──────────────
 *   activity-feed.ts  ──┐
 *                       ├─→ /api/notifications SSE  ──→  Notification API
 *   issue-store.ts    ──┘                                (browser)
 *
 * This bridge re-routes the same SSE messages through the platform-
 * detecting `notify()` in lib/client/notifications.ts:
 *
 *   • Web/Electron: same Notification API, plus electron-native via
 *     preload (better UX when window is hidden).
 *   • iOS: @capacitor/local-notifications.schedule() — works in
 *     foreground; coalesces by tag for repeat events.
 *
 * Call `installNotificationsBridge(backendUrl)` once at app startup
 * (after backend-discovery resolves). Returns a `stop()` function for
 * teardown when the user reconfigures the backend.
 */
import { notify, requestPermission } from './notifications';

export type SseEvent = {
  id: string;
  level: 'info' | 'success' | 'warn' | 'error';
  title?: string;
  source?: string;
  message?: string;
  jobId?: string;
  createdAt?: number;
};

export function installNotificationsBridge(backendUrl: string): () => void {
  // Eagerly request permission so the first surfaced notification fires.
  void requestPermission();

  const es = new EventSource(backendUrl.replace(/\/$/, '') + '/api/notifications');

  es.addEventListener('message', (ev) => {
    let event: SseEvent;
    try {
      event = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!event || (event.level !== 'warn' && event.level !== 'error' && event.level !== 'success')) {
      // We only surface non-info notifications by default. The user can
      // toggle info-level via ui-prefs.notifications.os.info.
      return;
    }
    const tag = event.jobId ? `apply:${event.jobId}` : event.source ?? event.id;
    void notify({
      title: event.title ?? `career-ops: ${event.level}`,
      body: event.message ?? '',
      tag,
      level: event.level,
      deepLink: event.jobId ? `careerops://job/${event.jobId}` : undefined,
      onClick: () => {
        if (event.jobId && typeof window !== 'undefined') {
          window.location.href = `/job/${event.jobId}`;
        }
      },
    });
  });

  es.addEventListener('error', () => {
    // EventSource auto-reconnects on its own; no-op.
  });

  return () => es.close();
}
