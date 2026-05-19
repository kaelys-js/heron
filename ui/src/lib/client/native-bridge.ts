/**
 * native-bridge — JS wrapper around the HeronNative Capacitor plugin.
 *
 * Calls fall through with safe defaults on non-iOS platforms so the
 * Web / Electron builds don't crash. Each method has a runtime guard:
 * if the plugin isn't registered (Web build), it returns a sensible
 * fallback.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BRAND, BRAND_STORAGE_PREFIX } from './brand';

/** Web/desktop fallback prefix for keychain emulation via localStorage. */
const KC_PREFIX = `${BRAND_STORAGE_PREFIX}:kc:`;

export type JobIndexEntry = {
  id: string;
  company: string;
  role: string;
  score?: number;
  status?: string;
};

type NativePlugin = {
  getLanUrl(): Promise<{ url: string | null }>;
  biometricAvailable(): Promise<{ available: boolean }>;
  biometricAuth(opts: { reason: string }): Promise<{ ok: boolean; reason?: string }>;
  keychainSet(opts: { key: string; value: string }): Promise<{ ok: boolean }>;
  keychainGet(opts: { key: string }): Promise<{ value: string | null }>;
  keychainRemove(opts: { key: string }): Promise<{ ok: boolean }>;
  indexJobs(opts: { jobs: JobIndexEntry[] }): Promise<{ ok: boolean; indexed: number }>;
  clearJobIndex(): Promise<{ ok: boolean }>;
  setUserActivity(opts: {
    type: string;
    title: string;
    data: Record<string, unknown>;
  }): Promise<{ ok: boolean }>;
  drainNativeErrors(): Promise<{ errors: Array<Record<string, unknown>> }>;
  updateWidgets(opts: WidgetUpdate): Promise<{ ok: boolean }>;
  setSharedBearerToken(opts: { token: string }): Promise<{ ok: boolean }>;
  clearSharedBearerToken(): Promise<{ ok: boolean }>;
  setSharedBackendUrl(opts: { url: string }): Promise<{ ok: boolean }>;
  setSharedQuietHours(opts: { json: string }): Promise<{ ok: boolean }>;
};

export type WidgetUpdate = {
  /** Auth gate visible to every iPhone widget + the Watch.
   *
   *   • `true`  → widgets render real data (stats, nextInterview, topApply,
   *               openIssues). Passing this without data is fine — widgets
   *               just show the empty placeholder.
   *   • `false` → NativePlugin.updateWidgets scrubs every cached
   *               key from App Group UserDefaults and the Watch flips
   *               to its SignInGate immediately. Use this on sign-out so
   *               a screenshot of the home screen or Lock Screen never
   *               leaks the previous user's queue to the next person to
   *               pick up the phone.
   *
   * If omitted (legacy callers), the plugin defaults to `true`, which
   * matches the existing behaviour pre-gate.
   */
  authenticated?: boolean;
  stats?: {
    queued?: number;
    appliedToday?: number;
    upcomingInterviews?: number;
  };
  /** Pass null to clear the next-interview slot (no scheduled interview). */
  nextInterview?: {
    jobId: string;
    company: string;
    role: string;
    stage: string;
    scheduledAt: string; // ISO
    interviewers: string[];
  } | null;
  /** Pass null to clear (nothing queued / scored). */
  topApply?: {
    jobId: string;
    company: string;
    role: string;
    score: number;
    compBand?: string;
    location?: string;
    portal?: string;
  } | null;
  /** Latest open issues (already filtered to the acting user). */
  openIssues?: Array<{
    id: string;
    severity: 'info' | 'warn' | 'error';
    source: string;
    summary: string;
    ts: number;
  }>;
};

// Plugin-name is the JS↔Swift bridge contract. Same string lives in
// NativePlugin.swift::jsName; both sides read from
// branding/brand.json::identifiers.capacitorPluginName via apply-brand.
const native = registerPlugin<NativePlugin>(BRAND.capacitorPluginName);

/**
 * Runtime platform check. Exported so the layout boot path can skip the
 * widget snapshot fetch entirely on web/desktop — there's no plugin to
 * call there, and the GET round-trip would just be wasted cycles.
 */
export function isIos(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

export async function getLanUrl(): Promise<string | null> {
  if (!isIos()) return null;
  try {
    const res = await native.getLanUrl();
    return res.url;
  } catch {
    return null;
  }
}

export async function biometricAvailable(): Promise<boolean> {
  if (!isIos()) return false;
  try {
    const res = await native.biometricAvailable();
    return res.available;
  } catch {
    return false;
  }
}

export async function biometricAuth(reason: string): Promise<boolean> {
  if (!isIos()) return true; // No gate on web/desktop yet
  try {
    const res = await native.biometricAuth({ reason });
    return res.ok;
  } catch {
    return false;
  }
}

export async function keychainSet(key: string, value: string): Promise<boolean> {
  if (!isIos()) {
    // Fallback: store in IndexedDB or just-localStorage on web/desktop.
    try {
      localStorage.setItem(KC_PREFIX + key, value);
      return true;
    } catch {
      return false;
    }
  }
  try {
    const res = await native.keychainSet({ key, value });
    return res.ok;
  } catch {
    return false;
  }
}

export async function keychainGet(key: string): Promise<string | null> {
  if (!isIos()) {
    try {
      return localStorage.getItem(KC_PREFIX + key);
    } catch {
      return null;
    }
  }
  try {
    const res = await native.keychainGet({ key });
    return res.value;
  } catch {
    return null;
  }
}

export async function keychainRemove(key: string): Promise<boolean> {
  if (!isIos()) {
    try {
      localStorage.removeItem(KC_PREFIX + key);
      return true;
    } catch {
      return false;
    }
  }
  try {
    const res = await native.keychainRemove({ key });
    return res.ok;
  } catch {
    return false;
  }
}

export async function indexJobs(jobs: JobIndexEntry[]): Promise<number> {
  if (!isIos()) return 0;
  try {
    const res = await native.indexJobs({ jobs });
    return res.indexed;
  } catch {
    return 0;
  }
}

export async function clearJobIndex(): Promise<boolean> {
  if (!isIos()) return true;
  try {
    const res = await native.clearJobIndex();
    return res.ok;
  } catch {
    return false;
  }
}

export async function setUserActivity(
  type: string,
  title: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  if (!isIos()) return true;
  try {
    const res = await native.setUserActivity({ type, title, data });
    return res.ok;
  } catch {
    return false;
  }
}

/** Subscribe to iOS native network-status changes (NWPathMonitor →
 *  NativePlugin.notifyListeners). Returns a remover. */
export function onNetStatusChange(handler: (online: boolean) => void): () => void {
  if (!isIos()) return () => {};
  try {
    const sub = (native as any).addListener?.('netStatusChanged', (e: { online: boolean }) =>
      handler(e.online),
    );
    return () => {
      try {
        sub?.remove?.();
      } catch {
        // Subscription already removed or Capacitor not present — no-op
        // on cleanup is safe.
      }
    };
  } catch {
    // Capacitor native bridge unavailable (web/desktop). Return a no-op
    // unsubscriber so callers can always invoke it.
    return () => {};
  }
}

/** Read + clear queued native iOS errors. Called by the error-reporter
 *  during its flush cycle so iOS native errors land in /api/issues
 *  through the same path web/desktop errors take. */
export async function drainNativeErrors(): Promise<Array<Record<string, unknown>>> {
  if (!isIos()) return [];
  try {
    const res = await native.drainNativeErrors();
    return res.errors ?? [];
  } catch {
    return [];
  }
}

/**
 * Push fresh widget data into the App Group container and trigger a
 * timeline reload. Call this whenever the dashboard state that powers
 * a widget changes:
 *
 *   • after queue/applied/interviews counter changes → stats
 *   • after schedule/cancel/reschedule interview → nextInterview
 *   • after a new high-score job lands → topApply
 *   • after issue added/resolved → openIssues
 *
 * Cheap to call repeatedly; the underlying UserDefaults write is
 * microseconds and WidgetCenter coalesces reload requests.
 */
export async function updateWidgets(update: WidgetUpdate): Promise<boolean> {
  if (!isIos()) return false;
  try {
    const res = await native.updateWidgets(update);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Mirror the current bearer token into App Group UserDefaults so the
 * Share Extension can read it on its next POST. Without this, the
 * extension lands at /api/pipeline as an unauthenticated request and
 * the URL is dropped silently.
 *
 * Called from auth-client.ts's customFetch every time a `set-auth-token`
 * header is captured (sign-in / sign-up flows). No-op on web/desktop.
 */
export async function setSharedBearerToken(token: string | null): Promise<boolean> {
  if (!isIos()) return false;
  try {
    if (token === null || token === '') {
      const res = await native.clearSharedBearerToken();
      return res.ok;
    }
    const res = await native.setSharedBearerToken({ token });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Mirror the resolved backend URL into App Group UserDefaults so the
 * Share Extension knows where to POST. Called once on cold boot after
 * backend-discovery resolves.
 */
export async function setSharedBackendUrl(url: string | null): Promise<boolean> {
  if (!isIos()) return false;
  try {
    const res = await native.setSharedBackendUrl({ url: url ?? '' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Mirror the user's quiet-hours preference into App Group UserDefaults
 * so the BackgroundFetcher (Swift, runs outside the WebView's
 * localStorage scope) can honour the same window when deciding whether
 * to surface a warn-level notification at 3am.
 *
 * Passed as a serialized JSON string of the QuietHours shape — same
 * payload localStorage holds, so the Swift side decodes the same shape
 * and runs the same cross-midnight window logic.
 */
export async function setSharedQuietHours(json: string): Promise<boolean> {
  if (!isIos()) return false;
  try {
    const res = await native.setSharedQuietHours({ json });
    return res.ok;
  } catch {
    return false;
  }
}
