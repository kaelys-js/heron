/**
 * native-bridge — JS wrapper around the CareerOpsNative Capacitor plugin.
 *
 * Calls fall through with safe defaults on non-iOS platforms so the
 * Web / Electron builds don't crash. Each method has a runtime guard:
 * if the plugin isn't registered (Web build), it returns a sensible
 * fallback.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BRAND_STORAGE_PREFIX } from './brand';

/** Web/desktop fallback prefix for keychain emulation via localStorage. */
const KC_PREFIX = `${BRAND_STORAGE_PREFIX}:kc:`;

export type JobIndexEntry = {
  id: string;
  company: string;
  role: string;
  score?: number;
  status?: string;
};

type CareerOpsNativePlugin = {
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
};

const native = registerPlugin<CareerOpsNativePlugin>('CareerOpsNative');

function isIos(): boolean {
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
 *  CareerOpsNativePlugin.notifyListeners). Returns a remover. */
export function onNetStatusChange(handler: (online: boolean) => void): () => void {
  if (!isIos()) return () => {};
  try {
    const sub = (native as any).addListener?.('netStatusChanged', (e: { online: boolean }) =>
      handler(e.online),
    );
    return () => {
      try {
        sub?.remove?.();
      } catch {}
    };
  } catch {
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
