import type { HandleClientError } from '@sveltejs/kit';
import { reportClientError } from '$lib/notifications.svelte';
import { stringify as devalueStringify } from 'devalue';

/**
 * Capacitor (adapter-static) `__data.json` shim — fixes the iOS WebView
 * reload loop.
 *
 * When SvelteKit's client router navigates between routes, it fetches
 * `/__data.json?x-sveltekit-invalidated=N` to obtain the result of the
 * route's `+page.server.ts` load(). In our adapter-static build the
 * WebView has no server — those files don't exist on disk, so the
 * fetch fails. SvelteKit's load pipeline rejects, the layout's
 * <svelte:boundary> catches the error, the page reloads, hydration
 * runs again, refetches __data.json, fails again — a continuous
 * ~9-reload-per-second loop that the user sees as a flashing white
 * screen.
 *
 * Short-circuit: when the page is loaded from a non-http scheme
 * (careerops://, capacitor://, app://, file://) we intercept every
 * fetch to `__data.json` and return an empty SvelteKit data envelope.
 * Pages render against undefined `data` props — which is exactly what
 * +layout.svelte already tolerates via `data?.activeProfile?.id`
 * style optional-chaining. Real API data flows through api.ts →
 * backend-discovery to the resolved backend, not through this path.
 */
if (typeof window !== 'undefined' && !window.location.protocol.startsWith('http')) {
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (url && url.includes('__data.json')) {
      // SvelteKit serializes `data` via devalue (NOT plain JSON), so each
      // node.data field is a devalue-format ARRAY (not a JS object). If we
      // ship a plain object devalue.parse throws "Invalid input" and the
      // page silently fails to hydrate. Use devalue.stringify to encode
      // generous defaults so consumers (`data.runtime.runningTasks`,
      // `data.counts.totalJobs`, etc.) get sensible empties.
      const empty = {
        // Layout-level (root +layout.server.ts)
        profilesState: { activeId: 'default', profiles: [] as unknown[] },
        activeProfile: null as unknown,
        profileAutomations: {} as Record<string, unknown>,
        inboxCount: 0,
        queueCount: 0,
        pinnedJobs: [] as unknown[],
        isCapacitor: true,
        isBrowser: true,
        // Page-level runtime/health fields (inbox + settings + others)
        runtime: {
          runningTasks: [] as string[],
          hasGemini: false,
          hasAnthropic: false,
          hasClaude: false,
          hasCV: false,
          hasProfile: false,
          hasPortals: false,
          hasArticleDigest: false,
          hasOnboarding: false,
          version: '0.0.0',
        },
        // Inbox shape
        profileId: 'default',
        firstName: '',
        nowISO: new Date().toISOString(),
        upNext: [] as unknown[],
        upNextTotal: 0,
        ready: [] as unknown[],
        readyTotal: 0,
        inFlight: [] as unknown[],
        inFlightTotal: 0,
        followUps: [] as unknown[],
        followUpsTotal: 0,
        followupsCadenceMeta: { actionable: 0 },
        followupsOverdue: [] as unknown[],
        followupsUrgent: [] as unknown[],
        inboundLeads: [] as unknown[],
        postApplyCards: [] as unknown[],
        counts: { totalJobs: 0, unscored: 0, totalApps: 0, activeCount: 0 },
        velocity: [] as unknown[],
        last7: 0,
        prev7: 0,
        velocityDeltaPct: null,
        topSources: [] as unknown[],
        activity: [] as unknown[],
        recentErrorsCount: 0,
        pipelineDaysAgo: null,
        alerts: [] as unknown[],
        applyIssues: [] as unknown[],
      };
      // devalue.stringify produces a JSON string of a devalue-format array.
      // SvelteKit's loader calls devalue.parse on each node.data; that
      // function expects EITHER the array OR the JSON string form. We pass
      // the parsed array so it round-trips correctly inside our envelope.
      const encoded = JSON.parse(devalueStringify(empty));
      const node = { type: 'data', data: encoded, uses: {} };
      const body = JSON.stringify({
        type: 'data',
        nodes: [node, node, node, node, node, node, node, node, node, node],
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return origFetch(input as RequestInfo, init);
  };
}

/**
 * Funnel every client-side error through `reportClientError` so the user always
 * sees a toast + activity-feed entry instead of a silent console log.
 *
 * Three sources are wired up:
 *   1. SvelteKit `handleError` hook — load/navigation lifecycle errors
 *   2. `<svelte:boundary onerror>` in +layout.svelte — component-tree errors ($effect, render, lifecycle)
 *   3. Plain `window.error` and `window.unhandledrejection` — anything outside Svelte's reach
 */
export const handleError: HandleClientError = ({ error, event, status, message }) => {
  const url = event?.url?.pathname ?? '?';
  reportClientError('sveltekit', '[' + status + '] ' + url, error);
  return {
    message: status >= 500 ? 'Something broke on our end.' : message,
    code: (error as { code?: string })?.code,
  };
};

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e: ErrorEvent) => {
    if (!e.error && !e.message) return;
    const stackFrame =
      (e.error?.stack ?? '').split('\n')[0] ||
      (e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : '');
    reportClientError('window', 'Uncaught error', e.error ?? e.message, {
      message: stackFrame
        ? (e.error?.message ?? e.message) + ' · ' + stackFrame
        : (e.error?.message ?? e.message),
    });
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const code = (e.reason as { code?: string })?.code;
    reportClientError('promise', 'Unhandled promise rejection', e.reason, {
      message: code
        ? '[' + code + '] ' + (e.reason instanceof Error ? e.reason.message : String(e.reason))
        : undefined,
    });
  });
}
