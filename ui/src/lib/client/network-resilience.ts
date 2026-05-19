/** Abort-on-offline + auto-retry-on-recovery for lib/api.ts. On
 *  `heron:net-status { online: false }` (iOS NWPathMonitor fires
 *  earlier than navigator.onLine), every in-flight AbortController
 *  cancels so callers get AbortError instead of a 30s TCP hang.
 *  Failed idempotent requests (GET by default; mutation only if
 *  `retryable: true`) enqueue + replay on next online signal. Caller
 *  opts in to mutation retry because a dropped response packet on a
 *  successful POST would silently double-apply. Queue capped at
 *  MAX_QUEUE_SIZE. */
import { BRAND_EVENTS } from './brand';

/** Cap the retry queue to prevent unbounded memory growth during a
 *  pathological flap (e.g., a buggy onresume handler firing 100 GETs
 *  every 200ms while toggling offline). 50 covers reasonable real-world
 *  worst cases (dashboard mount fires ~12 parallel queries; we leave
 *  ~4x headroom). */
const MAX_QUEUE_SIZE = 50;

/** Set of every in-flight request's AbortController. We add on apiCall
 *  start and remove in a finally block. */
const inflight = new Set<AbortController>();

/** Single retry attempt per queued entry -- if it fails AGAIN we give up
 *  rather than spiral. */
type Retryable = {
  url: string;
  init: RequestInit;
  resolve: (response: Response) => void;
  reject: (err: unknown) => void;
};
const retryQueue: Retryable[] = [];

/** True when listeners are wired. Lazy install on first apiCall avoids
 *  paying the cost in SSR / Node tests that never make HTTP calls. */
let installed = false;

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // Native true-offline detection -- iOS NWPathMonitor.swift dispatches
  // heron:net-status with { online: false } when path goes unsatisfied.
  window.addEventListener(BRAND_EVENTS.netStatus, ((e: Event) => {
    const detail = (e as CustomEvent<{ online?: boolean }>).detail;
    if (detail && detail.online === false) {
      abortAll();
    } else {
      // Any other transition (online or unspecified) → try the queue.
      drainQueue();
    }
  }) as EventListener);
  // Browser-default online event -- fires when navigator.onLine flips
  // back to true. On iOS this lags NWPathMonitor; both paths converge
  // on drainQueue.
  window.addEventListener('online', () => drainQueue());
}

/** Abort every in-flight request. Idempotent -- already-aborted
 *  controllers swallow the second abort silently. */
function abortAll(): void {
  for (const ctrl of inflight) {
    try {
      ctrl.abort();
    } catch {
      /* idempotent */
    }
  }
  // Don't clear inflight here -- apiCall's finally block removes each
  // entry naturally as its fetch settles.
}

/** Register a request's controller for the duration of its fetch.
 *  Returns the controller (existing if caller passed one via init.signal,
 *  fresh otherwise). Caller MUST call unregister() in finally. */
export function register(init: RequestInit): AbortController {
  install();
  // Reuse the caller's controller if they passed one -- composes with
  // caller-side timeouts cleanly.
  let ctrl: AbortController;
  if (init.signal && init.signal instanceof AbortSignal && !init.signal.aborted) {
    // We can't extract the controller from a foreign signal; create a
    // bridge controller that aborts when EITHER ours OR theirs aborts.
    ctrl = new AbortController();
    if (init.signal.aborted) {
      ctrl.abort();
    } else {
      init.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
  } else {
    ctrl = new AbortController();
  }
  inflight.add(ctrl);
  return ctrl;
}

export function unregister(ctrl: AbortController): void {
  inflight.delete(ctrl);
}

/** Enqueue an idempotent-or-opted-in request for replay on next online. */
export function enqueueForRetry(entry: Retryable): void {
  install();
  if (retryQueue.length >= MAX_QUEUE_SIZE) {
    // Drop the oldest entry to make room. Caller's promise rejects so
    // they fall into their normal error path -- better than silently
    // queueing forever.
    const dropped = retryQueue.shift();
    dropped?.reject(new Error('retry queue full — request dropped'));
  }
  retryQueue.push(entry);
}

/** Replay every queued request once. Strips the entries first so a
 *  failing replay can't re-enqueue itself in the same tick. */
function drainQueue(): void {
  if (retryQueue.length === 0) return;
  const batch = retryQueue.splice(0, retryQueue.length);
  for (const entry of batch) {
    void fetch(entry.url, entry.init).then(
      (response) => entry.resolve(response),
      (err) => entry.reject(err),
    );
  }
}

/** TEST-ONLY: clear the queue + abort set so spec cases don't pollute
 *  each other. Production never calls this. */
export function __reset(): void {
  for (const c of inflight) {
    try {
      c.abort();
    } catch {
      /* idempotent */
    }
  }
  inflight.clear();
  retryQueue.length = 0;
  installed = false;
}

/** True if the request is safe to auto-retry. GETs are idempotent by
 *  HTTP contract; mutations require explicit caller opt-in. */
export function isRetryable(init: RequestInit, optIn: boolean | undefined): boolean {
  if (optIn === true) return true;
  if (optIn === false) return false;
  const method = (init.method ?? 'GET').toUpperCase();
  return method === 'GET' || method === 'HEAD';
}
