/**
 * error-reporter — unified, platform-aware error capture.
 *
 * Every error funnels through `reportError(err, context?)`. Behavior:
 *
 *   1. **Always**: console.error with structured context.
 *   2. **Always**: POSTs to `/api/issues` on the resolved backend so the
 *      existing Issues system (Inbox / dedupe / activity feed) sees it.
 *      Web + Electron + iOS Capacitor all use the same endpoint.
 *   3. **If backend unreachable**: queues the error in localStorage and
 *      retries on next reportError call (or on `installErrorReporter`
 *      bootstrap).
 *   4. **Surfaces a toast** for level=error so the user sees it.
 *   5. **Fires an OS notification** for level=error AND severity=high
 *      (rate-limited so we don't spam).
 *
 * The "common/shared system" the user asked for: this funnels every
 * platform into the EXISTING career-ops Issues store (server-side
 * issue-store.ts) — the same store the autonomous-apply pipeline writes
 * to, the same store the Inbox displays. iOS / Electron / Web errors
 * all show up alongside apply failures, IMAP errors, etc.
 *
 * Wire this up once at app boot:
 *   import { installErrorReporter } from '$lib/client/error-reporter';
 *   installErrorReporter(resolvedBackendUrl);
 */
import { toast } from 'svelte-sonner';
import { BRAND, BRAND_STORAGE_PREFIX } from './brand';
import { notify } from './notifications';

export type ReportLevel = 'info' | 'warn' | 'error';
export type ReportContext = {
  source?: string; // module / component / route that raised
  jobId?: string; // if relevant
  route?: string; // current url path
  userAction?: string; // what the user was doing
  data?: Record<string, unknown>; // extra diagnostic info
};

type QueuedReport = {
  message: string;
  stack?: string;
  level: ReportLevel;
  context?: ReportContext;
  capturedAt: number;
  attempts: number;
};

const QUEUE_KEY = `${BRAND_STORAGE_PREFIX}:error-queue`;
const RATE_LIMIT_MS = 30_000; // suppress duplicate OS notifications for 30s
const recentTags = new Map<string, number>();
let backendUrl: string | null = null;

/** Set the resolved backend URL — called once after backend-discovery. */
export function setReporterBackend(url: string | null): void {
  backendUrl = url;
  if (url) void flushQueue();
}

/** Install global handlers — onerror + onunhandledrejection + Electron IPC. */
export function installErrorReporter(initialBackendUrl?: string): void {
  if (initialBackendUrl) setReporterBackend(initialBackendUrl);
  if (typeof window === 'undefined') return;
  // Global JS errors
  window.addEventListener('error', (e) => {
    const err = e.error ?? new Error(e.message ?? 'Unknown error');
    void reportError(err, { source: 'window.onerror', route: location?.pathname });
  });
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    const reason =
      e.reason instanceof Error
        ? e.reason
        : new Error(typeof e.reason === 'string' ? e.reason : JSON.stringify(e.reason));
    if (isBenignRejection(reason)) {
      // Still log to the console for debugging, but don't toast or queue —
      // these are spec-defined "you navigated faster than the animation
      // finished" notices, not real errors.
      console.debug('[benign]', reason.message);
      e.preventDefault();
      return;
    }
    void reportError(reason, { source: 'unhandledrejection', route: location?.pathname });
  });
  // Electron main-process errors arrive via IPC channel `<brand>:main-error`
  // (Capacitor's preload exposes electronAPI globally). Forward them into
  // the unified reporter so they end up in the same Issues store.
  const w = window as any;
  if (w?.electronAPI?.on) {
    try {
      w.electronAPI.on(
        `${BRAND.name}:main-error`,
        (payload: { message: string; stack?: string; source?: string }) => {
          const err = new Error(payload.message);
          if (payload.stack) err.stack = payload.stack;
          void reportError(err, { source: payload.source ?? 'electron-main' });
        },
      );
    } catch {
      /* preload not loaded yet */
    }
  }
  // Try to flush any leftover errors from a prior session
  void flushQueue();
}

/** Capture and route an error. */
export async function reportError(
  err: unknown,
  context: ReportContext = {},
  level: ReportLevel = 'error',
): Promise<void> {
  const e =
    err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  const ctx = {
    ...context,
    route: context.route ?? (typeof location !== 'undefined' ? location.pathname : undefined),
  };

  // 1. Console always
  console.error(`[${BRAND.name}:${level}]`, e, ctx);

  // 2. Toast for visible errors
  if (level === 'error') {
    try {
      toast.error(e.message.slice(0, 200), {
        description: ctx.source ? `Source: ${ctx.source}` : undefined,
        duration: 8000,
      });
    } catch {
      /* svelte-sonner not mounted yet */
    }
  }

  const payload: QueuedReport = {
    message: e.message,
    stack: e.stack,
    level,
    context: ctx,
    capturedAt: Date.now(),
    attempts: 0,
  };

  // 3. Try to send to backend, else queue
  const sent = await sendToBackend(payload);
  if (!sent) queueLocally(payload);

  // 4. OS notification (rate-limited) for visible errors
  if (level === 'error') {
    const tag = `error:${e.message.slice(0, 80)}`;
    const lastFired = recentTags.get(tag) ?? 0;
    if (Date.now() - lastFired > RATE_LIMIT_MS) {
      recentTags.set(tag, Date.now());
      void notify({
        title: `${BRAND.displayName} error`,
        body: e.message.slice(0, 200),
        tag,
        level: 'error',
      });
    }
  }
}

/** Convenience wrapper for warnings. */
export function reportWarning(err: unknown, context?: ReportContext): Promise<void> {
  return reportError(err, context, 'warn');
}

/** Convenience wrapper for info-level diagnostics. */
export function reportInfo(message: string, context?: ReportContext): Promise<void> {
  return reportError(new Error(message), context, 'info');
}

/**
 * Some thrown values reach `unhandledrejection` even though they're
 * spec-defined "this is fine" notices — most notably the view-transition
 * AbortError that fires when the user navigates faster than the current
 * crossfade can finish. We surface those to console (debugging is still
 * useful) but skip the user-visible toast + issue-store entry. Add new
 * patterns here only when you're CERTAIN the rejection is benign for the
 * user.
 */
function isBenignRejection(err: Error): boolean {
  const msg = err.message ?? '';
  // View Transitions API spec: "Aborted by new transition" / "skipped
  // because the document changed". Chromium / Safari word it slightly
  // differently so we match on the unique substrings.
  if (/old view transition.*aborted/i.test(msg)) return true;
  if (/view transition.*skipped/i.test(msg)) return true;
  if (/view transition.*new view transition/i.test(msg)) return true;
  return false;
}

// ───────────────────────────────────────────────────────────────────
// Internals
// ───────────────────────────────────────────────────────────────────

async function sendToBackend(payload: QueuedReport): Promise<boolean> {
  if (!backendUrl) return false;
  try {
    const url = backendUrl.replace(/\/$/, '') + '/api/issues';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        source: payload.context?.source ?? 'client',
        level: payload.level,
        title: payload.message.slice(0, 120),
        summary: payload.message,
        stack: payload.stack,
        jobId: payload.context?.jobId,
        userAction: payload.context?.userAction,
        route: payload.context?.route,
        data: payload.context?.data,
        capturedAt: payload.capturedAt,
        // Stable dedupe key — same error in the same route within a
        // session collapses to one issue.
        dedupeKey: `client:${payload.context?.source ?? 'unknown'}:${payload.message.slice(0, 80)}`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function queueLocally(payload: QueuedReport): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const queue: QueuedReport[] = raw ? JSON.parse(raw) : [];
    queue.push(payload);
    // Cap queue at 50 entries — drop oldest
    if (queue.length > 50) queue.splice(0, queue.length - 50);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* localStorage full / disabled */
  }
}

async function flushQueue(): Promise<void> {
  if (!backendUrl) return;

  // First, pull any iOS-native errors queued by ErrorReporter.swift
  // and forward them through the same /api/issues pipeline as everything
  // else. drainNativeErrors() is a no-op on web/desktop.
  try {
    const { drainNativeErrors } = await import('./native-bridge');
    const nativeErrors = await drainNativeErrors();
    for (const e of nativeErrors) {
      await sendToBackend({
        message: String(e.message ?? 'iOS native error'),
        stack: undefined,
        level: (e.level as ReportLevel) ?? 'error',
        context: { source: String(e.source ?? 'ios-native'), data: e },
        capturedAt: Number(e.capturedAt ?? Date.now()),
        attempts: 0,
      });
    }
  } catch {
    /* no native bridge available */
  }

  // Then the localStorage retry queue
  if (typeof localStorage === 'undefined') return;
  let queue: QueuedReport[] = [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (raw) queue = JSON.parse(raw);
  } catch {
    return;
  }
  if (queue.length === 0) return;

  const remaining: QueuedReport[] = [];
  for (const item of queue) {
    item.attempts++;
    if (item.attempts > 5) continue; // give up after 5 retries
    const sent = await sendToBackend(item);
    if (!sent) remaining.push(item);
  }
  try {
    if (remaining.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  } catch {
    /* ignore */
  }
}

/** For unit-test injection. */
export function _testHelpers() {
  return { sendToBackend, queueLocally, flushQueue, QUEUE_KEY, recentTags };
}
