import type { HandleClientError } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { report } from '$lib/client/error-reporter';
import { stringify as devalueStringify } from 'devalue';

/**
 * Capacitor (adapter-static) `__data.json` shim -- fixes the iOS WebView
 * reload loop.
 *
 * When SvelteKit's client router navigates between routes, it fetches
 * `/__data.json?x-sveltekit-invalidated=N` to obtain the result of the
 * route's `+page.server.ts` load(). In our adapter-static build the
 * WebView has no server -- those files don't exist on disk, so the
 * fetch fails. SvelteKit's load pipeline rejects, the layout's
 * <svelte:boundary> catches the error, the page reloads, hydration
 * runs again, refetches __data.json, fails again -- a continuous
 * ~9-reload-per-second loop that the user sees as a flashing white
 * screen.
 *
 * Short-circuit: when the page is loaded from a non-http scheme
 * (heron://, capacitor://, app://, file://) we intercept every
 * fetch to `__data.json` and return an empty SvelteKit data envelope.
 * Pages render against undefined `data` props -- which is exactly what
 * +layout.svelte already tolerates via `data?.activeProfile?.id`
 * style optional-chaining. Real API data flows through api.ts →
 * backend-discovery to the resolved backend, not through this path.
 */
if (typeof window !== 'undefined' && !window.location.protocol.startsWith('http')) {
  const origFetch = window.fetch.bind(window);
  window.fetch = function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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
 * Funnel SvelteKit load/navigation lifecycle errors through the canonical
 * technical reporter (console + POST /api/telemetry; quiet per
 * $lib/report-routing).
 *
 * The plain `window.error` + `window.unhandledrejection` listeners are NOT
 * registered here -- error-reporter's installErrorReporter() (called from
 * +layout onMount) is the SINGLE place those are wired, so one JS error
 * fires the pipeline exactly once. Component-tree errors arrive via
 * `<svelte:boundary onerror>` in +layout.svelte, which calls
 * reportClientError (also a thin wrapper over report()).
 */
export const handleError: HandleClientError = ({ error, event, status, message }) => {
  const url = event?.url?.pathname ?? '?';
  // Correlation id: embedded in the reporter context AND returned on page.error,
  // so the error page can show it (copyable) and support can grep logs for it.
  const errorId = crypto.randomUUID();
  void report({
    err: error,
    level: 'error',
    kind: 'technical',
    context: { source: 'sveltekit', route: url, requestId: errorId },
  });
  return {
    message: status >= 500 ? 'Something broke on our end.' : message,
    code: (error as { code?: string })?.code,
    errorId,
    ...(dev ? { stack: (error as Error)?.stack } : {}),
  };
};
