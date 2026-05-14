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
import { BRAND, BRAND_EVENTS, jobDeepLink } from './brand';

/**
 * Sources that, when an event comes in for them, mean a widget surface
 * needs to refresh. These match the activity-feed event source tags
 * that touch widget data:
 *
 *   • apply-state, apply-linkedin, apply-greenhouse → topApply + stats
 *   • interview-schedule, interview-reminder → nextInterview + stats
 *   • scan, scan-portals, scan-curated → topApply (new high-scorers)
 *                                       + stats (queued count changes)
 *   • issue, issues → openIssues (Inbox widget)
 *
 * Substring match — events use prefixes like `apply-linkedin` /
 * `scan-broad` so we test for the root tag.
 */
const WIDGET_RELEVANT_SOURCES = ['apply', 'interview', 'scan', 'issue'];

function shouldRefreshWidgets(source?: string): boolean {
  if (!source) return false;
  return WIDGET_RELEVANT_SOURCES.some((tag) => source.startsWith(tag));
}

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
    if (!event) return;
    // Fire a widget-stale event whenever the activity feed reports
    // something that changes widget data — even for info-level events.
    // The +layout.svelte boot path listens for this and re-fetches
    // /api/widgets/snapshot, then pushes to the iPhone-side plugin.
    // Without this listener, widgets only refreshed on cold boot +
    // app-resume, missing every in-session state change.
    if (shouldRefreshWidgets(event.source) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`${BRAND_EVENTS.notify}:widgets-stale`));
    }
    if (event.level !== 'warn' && event.level !== 'error' && event.level !== 'success') {
      // We only surface non-info notifications by default. The user can
      // toggle info-level via ui-prefs.notifications.os.info.
      return;
    }
    const tag = event.jobId ? `apply:${event.jobId}` : (event.source ?? event.id);
    void notify({
      title: event.title ?? `${BRAND.displayName}: ${event.level}`,
      body: event.message ?? '',
      tag,
      level: event.level,
      deepLink: event.jobId ? jobDeepLink(event.jobId) : undefined,
      onClick: () => {
        // Defence-in-depth: jobId comes from server-sent events. If a
        // malicious JD ever poisons the upstream event producer, restrict
        // navigation to safe alphanumeric ids. Anything else stays put.
        if (
          event.jobId &&
          typeof window !== 'undefined' &&
          /^[a-zA-Z0-9_-]{1,64}$/.test(event.jobId)
        ) {
          window.location.href = `/job/${encodeURIComponent(event.jobId)}`;
        }
      },
    });
  });

  es.addEventListener('error', () => {
    // EventSource auto-reconnects on its own; no-op.
  });

  return () => es.close();
}
