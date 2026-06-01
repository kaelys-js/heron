/** Bridges the activity-feed SSE (`/api/stream`) into the iOS widget
 *  refresh pipeline. Call installWidgetRefreshBridge() once at boot; it
 *  returns a stop() teardown. Uses the shared sse-client wrapper
 *  (getApiBase resolution for Capacitor, exponential backoff, native
 *  net-status reconnect).
 *
 *  Scope note (R7): OS notifications are NOT this bridge's job. After the
 *  reporting refactor the bell's own `/api/stream` subscription
 *  (notifications.svelte.ts) dispatches a `heron:notify` CustomEvent for
 *  PRODUCT events, and PushNotificationsToggle.svelte is the single path
 *  that fires the OS Notification. This bridge only listens for
 *  widget-relevant events and pokes the layout to re-fetch the widget
 *  snapshot -- a behaviour nothing else covers. */
import { BRAND_EVENTS } from './brand';
import { createSseClient } from './sse-client';
import { eventKind } from '$lib/report-routing';
import type { ActivityEvent } from '$lib/types';

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
 * Substring match -- events use prefixes like `apply-linkedin` /
 * `scan-broad` so we test for the root tag.
 */
const WIDGET_RELEVANT_SOURCES = ['apply', 'interview', 'scan', 'issue'];

function shouldRefreshWidgets(source?: string): boolean {
  if (!source) {
    return false;
  }
  return WIDGET_RELEVANT_SOURCES.some((tag) => source.startsWith(tag));
}

export function installWidgetRefreshBridge(): () => void {
  const client = createSseClient('/api/stream', {
    onMessage: (ev) => {
      let event: ActivityEvent;
      try {
        event = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!event) {
        return;
      }
      // Only PRODUCT events touch widget data. Technical diagnostics
      // (uncaught errors, web-vitals, render crashes) carry no
      // job-search state, so they must never trigger a widget re-fetch.
      // eventKind() derives product/technical from the event's category
      // when no explicit kind is set (see $lib/report-routing).
      if (eventKind(event) !== 'product') {
        return;
      }
      // Fire a widget-stale event whenever the activity feed reports
      // something that changes widget data. The +layout.svelte boot path
      // listens for this and re-fetches /api/widgets/snapshot, then
      // pushes to the iPhone-side plugin. Without this listener, widgets
      // only refreshed on cold boot + app-resume, missing every
      // in-session state change.
      if (shouldRefreshWidgets(event.source) && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(`${BRAND_EVENTS.notify}:widgets-stale`));
      }
    },
  });

  return () => client.close();
}
