/** Unified client report funnel. Every client-originated report goes
 *  through report().
 *
 *  Client reports are TECHNICAL in practice (uncaught JS errors, unhandled
 *  rejections, render/boundary crashes, SvelteKit load errors) -- the routing
 *  matrix in $lib/report-routing keeps technical QUIET: console always, then
 *  POST to /api/telemetry (the diagnostics sink), with NO toast, NO bell
 *  entry, NO OS notification. Product-loud surfacing is the server's job
 *  (reportIssue pings the bell over the SSE bus).
 *
 *  Pipeline: console.* -> consult routeReport(kind, level) -> POST
 *  /api/telemetry -> localStorage queue on backend-unreachable + retry on
 *  next call. Wire once at boot via installErrorReporter(resolvedBackendUrl). */
import { BRAND, BRAND_STORAGE_PREFIX, BRAND_STORAGE_KEYS } from './brand';
import { routeReport } from '$lib/report-routing';
import type { ReportKind } from '$lib/report-routing';
import { getRequestId } from './request-id';

export type ReportLevel = 'info' | 'warn' | 'error';
export type ReportContext = {
  source?: string; // module / component / route that raised
  jobId?: string; // if relevant
  route?: string; // current url path
  userAction?: string; // what the user was doing
  requestId?: string; // X-Request-Id correlation id (auto-filled from the meta)
  data?: Record<string, unknown>; // extra diagnostic info
};

/** Canonical report input. `kind` defaults to 'technical' -- the only
 *  kind the client originates in practice. */
export type ReportInput = {
  err: unknown;
  level?: ReportLevel;
  kind?: ReportKind;
  context?: ReportContext;
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
// Drop a queued report once it's older than this. A backend that was
// unreachable for a day means the report is stale -- the route/build it
// captured has moved on, so retrying it forever only ages-out useful queue
// slots + replays diagnostics no longer actionable.
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
let backendUrl: string | null = null;

/** App build (`<version>+<build>`) the page is running, read from the
 *  `<meta name="app-version">` hooks.server.ts injects. Threaded into the
 *  telemetry context so a persisted error carries the build that produced its
 *  minified stack -- the offline symbolicator keys off it. Returns '' off-server
 *  / pre-hydration (Capacitor static build), where the meta is absent. */
function getAppBuild(): string {
  if (typeof document === 'undefined') {
    return '';
  }
  return document.querySelector('meta[name="app-version"]')?.getAttribute('content') ?? '';
}

/** Set the resolved backend URL -- called once after backend-discovery. */
export function setReporterBackend(url: string | null): void {
  backendUrl = url;
  if (url) {
    void flushQueue();
  }
}

/** Install global handlers -- onerror + onunhandledrejection + Electron IPC.
 *  This is the ONE place window 'error' + 'unhandledrejection' are wired
 *  (hooks.client.ts no longer registers its own -- a single JS error must
 *  fire the pipeline exactly once). */
export function installErrorReporter(initialBackendUrl?: string): void {
  if (initialBackendUrl) {
    setReporterBackend(initialBackendUrl);
  }
  if (typeof window === 'undefined') {
    return;
  }
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
      // Still log to the console for debugging, but don't report -- these are
      // spec-defined "you navigated faster than the animation finished"
      // notices, not real errors.
      console.debug('[benign]', reason.message);
      e.preventDefault();
      return;
    }
    void reportError(reason, { source: 'unhandledrejection', route: location?.pathname });
  });
  // Electron main-process errors arrive via IPC channel `<brand>:main-error`
  // (Capacitor's preload exposes electronAPI globally). Forward them into
  // the unified reporter so they end up in the same diagnostics sink.
  const w = window as any;
  if (w?.electronAPI?.on) {
    try {
      w.electronAPI.on(
        `${BRAND.name}:main-error`,
        (payload: { message: string; stack?: string; source?: string }) => {
          const err = new Error(payload.message);
          if (payload.stack) {
            err.stack = payload.stack;
          }
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

/**
 * Canonical client report. console.* always; then routes per
 * routeReport(kind, level). For the client's technical kind that means a
 * POST to /api/telemetry and nothing user-facing -- no toast, no bell, no OS
 * notification. Returns once the send attempt (or queue) resolves.
 */
export async function report(input: ReportInput): Promise<void> {
  const { err, level = 'error', kind = 'technical', context = {} } = input;
  const e =
    err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  // An ApiError carries the FAILING request's own X-Request-Id (see api.ts) --
  // more precise than the page-level <meta> id when the report is for a fetch
  // error, so prefer it. Duck-typed (not `instanceof ApiError`) to avoid a
  // static import cycle: api.ts → online-status → … → error-reporter.
  const errRequestId =
    err && typeof err === 'object' && typeof (err as { requestId?: unknown }).requestId === 'string'
      ? (err as { requestId: string }).requestId
      : undefined;
  const ctx = {
    ...context,
    route: context.route ?? (typeof location !== 'undefined' ? location.pathname : undefined),
    // Correlate the client report with the server request log + X-Request-Id.
    // Priority: explicit ctx id → the failing request's own id → page <meta>.
    requestId: context.requestId ?? errRequestId ?? getRequestId() ?? undefined,
  };

  // 1. Console always (level-matched channel).
  if (level === 'error') {
    console.error(`[${BRAND.name}:${level}]`, e, ctx);
  } else if (level === 'warn') {
    console.warn(`[${BRAND.name}:${level}]`, e, ctx);
  } else {
    console.info(`[${BRAND.name}:${level}]`, e, ctx);
  }

  // 2. Routing. The client only originates technical reports in practice, so
  //    persist === 'diagnostics' (POST to /api/telemetry) and every
  //    user-facing surface (toast/bell/os) is off. We still honour the matrix
  //    rather than hardcoding so a future product-kind client report would
  //    Just Work the moment one is wired.
  const routing = routeReport(kind, level);

  if (routing.persist === 'diagnostics') {
    const payload: QueuedReport = {
      message: e.message,
      stack: e.stack,
      level,
      context: ctx,
      capturedAt: Date.now(),
      attempts: 0,
    };
    const sent = await sendToBackend(payload);
    if (!sent) {
      queueLocally(payload);
    }
  }
}

/** Capture and route a technical error. Thin wrapper over report(). */
export function reportError(
  err: unknown,
  context: ReportContext = {},
  level: ReportLevel = 'error',
): Promise<void> {
  return report({ err, level, kind: 'technical', context });
}

/** Convenience wrapper for technical warnings. */
export function reportWarning(err: unknown, context?: ReportContext): Promise<void> {
  return report({ err, level: 'warn', kind: 'technical', context });
}

/** Convenience wrapper for technical info-level diagnostics. */
export function reportInfo(message: string, context?: ReportContext): Promise<void> {
  return report({ err: new Error(message), level: 'info', kind: 'technical', context });
}

/** Count of client error reports queued in localStorage waiting to flush --
 *  the backend was unreachable when they were captured. Surfaced in Settings →
 *  Diagnostics so the user can see (and clear) a backlog. Returns 0 when
 *  localStorage is unavailable or the queue is empty / unreadable. */
export function pendingReportCount(): number {
  if (typeof localStorage === 'undefined') {
    return 0;
  }
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) {
      return 0;
    }
    const queue = JSON.parse(raw);
    return Array.isArray(queue) ? queue.length : 0;
  } catch {
    return 0;
  }
}

/** Discard every queued report. Backs the Settings → Diagnostics "Clear"
 *  control so a user can drop a stuck backlog without waiting out the TTL. */
export function clearReportQueue(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* localStorage unavailable -- nothing to clear */
  }
}

/**
 * Some thrown values reach `unhandledrejection` even though they're
 * spec-defined "this is fine" notices -- most notably the view-transition
 * AbortError that fires when the user navigates faster than the current
 * crossfade can finish. We surface those to console (debugging is still
 * useful) but skip the diagnostics send. Add new patterns here only when
 * you're CERTAIN the rejection is benign for the user.
 */
function isBenignRejection(err: Error): boolean {
  const msg = err.message ?? '';
  // View Transitions API spec: "Aborted by new transition" / "skipped
  // because the document changed". Chromium / Safari word it slightly
  // differently so we match on the unique substrings.
  if (/old view transition.*aborted/i.test(msg)) {
    return true;
  }
  if (/view transition.*skipped/i.test(msg)) {
    return true;
  }
  if (/view transition.*new view transition/i.test(msg)) {
    return true;
  }
  return false;
}

// ───────────────────────────────────────────────────────────────────
// Internals
// ───────────────────────────────────────────────────────────────────

async function sendToBackend(payload: QueuedReport): Promise<boolean> {
  if (!backendUrl) {
    return false;
  }
  try {
    // /api/telemetry is the public, rate-limited diagnostics sink. It writes
    // ONLY to the diagnostics activity feed (never issues.jsonl), so unlike
    // the old /api/issues path it needs no auth guard -- but we still carry
    // credentials + bearer where present so the server can attribute the
    // event to the right user when a session exists.
    const url = `${backendUrl.replace(/\/$/, '')}/api/telemetry`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const token =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(BRAND_STORAGE_KEYS.bearerToken)
          : null;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      /* localStorage unavailable -- fall back to cookie auth below */
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        type: 'error',
        level: payload.level,
        source: payload.context?.source ?? 'client',
        summary: payload.message,
        detail: payload.context?.userAction,
        stack: payload.stack,
        route: payload.context?.route,
        // Correlation id (X-Request-Id) -- lets the persisted diagnostic event
        // pivot to the matching server log line. Set from an ApiError's id or
        // the page meta.
        requestId: payload.context?.requestId,
        // App build (`<version>+<build>`) the client was running. Captured at
        // SEND time, not report time, but the build is constant for a session
        // so it's the same value either way -- the server persists it with the
        // stack for the offline symbolicator. '' (omitted) on a meta-less page.
        build: getAppBuild() || undefined,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function queueLocally(payload: QueuedReport): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const queue: QueuedReport[] = raw ? JSON.parse(raw) : [];
    queue.push(payload);
    // Cap queue at 50 entries -- drop oldest
    if (queue.length > 50) {
      queue.splice(0, queue.length - 50);
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* localStorage full / disabled */
  }
}

async function flushQueue(): Promise<void> {
  if (!backendUrl) {
    return;
  }

  // First, pull any iOS-native errors queued by ErrorReporter.swift
  // and forward them through the same /api/telemetry pipeline as everything
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
  if (typeof localStorage === 'undefined') {
    return;
  }
  let queue: QueuedReport[] = [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (raw) {
      queue = JSON.parse(raw);
    }
  } catch {
    return;
  }
  if (queue.length === 0) {
    return;
  }

  const remaining: QueuedReport[] = [];
  const now = Date.now();
  for (const item of queue) {
    // Drop reports older than the TTL -- don't retry stale diagnostics forever.
    // Guard a missing/NaN capturedAt (a hand-written or legacy entry) so it's
    // never treated as infinitely old.
    if (Number.isFinite(item.capturedAt) && now - item.capturedAt > QUEUE_TTL_MS) {
      continue;
    }
    item.attempts++;
    if (item.attempts > 5) {
      continue;
    } // give up after 5 retries
    const sent = await sendToBackend(item);
    if (!sent) {
      remaining.push(item);
    }
  }
  try {
    if (remaining.length === 0) {
      localStorage.removeItem(QUEUE_KEY);
    } else {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    }
  } catch {
    /* ignore */
  }
}

/** For unit-test injection. */
export function _testHelpers() {
  return { sendToBackend, queueLocally, flushQueue, QUEUE_KEY };
}
