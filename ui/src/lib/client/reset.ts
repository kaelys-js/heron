/** Client-side "Clear Cache & Reset".
 *
 *  Full reset: sign out + wipe ALL client-side state (the offline-read
 *  IndexedDB cache, brand-namespaced localStorage, native Preferences + iOS App
 *  Group mirror, and the Electron session storage) + reload to /login.
 *
 *  CLIENT-ONLY. This deletes zero server data -- every application, report, and
 *  profile on disk survives. Wiping server profile data is a SEPARATE, explicit
 *  action (ResetProfileDialog -> /api/profile/reset). Keep the two distinct.
 *
 *  Surfaces that call this: the Settings "Clear Cache & Reset" card, the Electron
 *  View-menu item, and `window.heron.clearCacheAndReset()`.
 */
import { signOut, clearLocalAuthState } from './auth-client';
import { BRAND, BRAND_STORAGE_KEYS } from './brand';

const PREFIX = `${BRAND.name}:`;

/** Keys preserved across a reset:
 *   - theme: so the reload doesn't flash to the default theme (the app.html
 *     inline FOUC script reads it).
 *   - backend-discovery config (tailscale / production URLs): DEVICE config, not
 *     user data -- re-running discovery is slow, and a reset shouldn't strand a
 *     LAN/Tailscale user who'd have to re-enter their backend URL. */
const PRESERVE = new Set<string>([
  BRAND_STORAGE_KEYS.theme,
  `${BRAND.name}:tailscale-url`,
  `${BRAND.name}:production-url`,
]);

/** PURE: given all localStorage keys, return the ones a reset should remove --
 *  every brand-prefixed key except the preserved theme/backend-config keys.
 *  Unrelated origin keys (no brand prefix) are never touched. Exported for tests. */
export function keysToScrub(allKeys: string[]): string[] {
  return allKeys.filter((k) => k.startsWith(PREFIX) && !PRESERVE.has(k));
}

interface ElectronClearBridge {
  electronAPI?: { clearCache?: () => Promise<void> };
}

export interface ClearOptions {
  /** Injectable for tests; defaults to a hard nav to /login. */
  reload?: (path: string) => void;
}

/** Sign out + wipe all client state + reload to /login. Best-effort at each
 *  step (a failed network sign-out / unavailable storage never blocks the
 *  teardown), so the user always lands on a clean /login. */
export async function clearClientCacheAndReset(opts: ClearOptions = {}): Promise<void> {
  const reload = opts.reload ?? ((path: string) => window.location.replace(path));

  // 1. Server-side sign-out -- clears the httpOnly session cookie that JS can't
  //    touch. Best-effort: proceed with local teardown even if offline.
  try {
    await signOut();
  } catch {
    /* offline / already signed out -- continue tearing down local state */
  }

  // 2. Proven auth teardown: bearer (Preferences + localStorage), iOS App Group
  //    (clearAllSharedState), and the offline-read IndexedDB cache.
  try {
    await clearLocalAuthState();
  } catch {
    /* best-effort */
  }

  // 3. Scrub the remaining brand-namespaced localStorage (collapse state, view
  //    modes, error-retry queue, devtools opt-in, ...) for a clean slate; keep
  //    theme + backend config (see PRESERVE).
  if (typeof localStorage !== 'undefined') {
    // Enumerate via the Storage spec API (length + key(i)), NOT
    // Object.keys(localStorage) -- the latter is unreliable across polyfills
    // (keys aren't always own-enumerable). Snapshot first, then remove.
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keysToScrub(keys)) {
      localStorage.removeItem(k);
    }
  }

  // 4. Electron only: the renderer can't clear the native session cache /
  //    storage, so ask the main process (no-op off Electron). Best-effort.
  try {
    const bridge =
      typeof window !== 'undefined' ? (window as Window & ElectronClearBridge) : undefined;
    await bridge?.electronAPI?.clearCache?.();
  } catch {
    /* best-effort */
  }

  // 5. Hard reload to a clean login. location.replace (not SvelteKit goto)
  //    avoids the client-router race the layout already documents for sign-out
  //    and guarantees a fresh module graph with the cleared storage.
  reload('/login');
}
