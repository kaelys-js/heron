/**
 * state-helpers -- utilities to drain Svelte 5 module-singleton state
 * between tests within the SAME file. (Across files, Vitest's
 * `isolate: true` config already gives us a fresh module graph.)
 *
 * Svelte 5's `$state` at module level produces ONE store per process.
 * Any test that mutates such a store (notifications, confirm gates,
 * sidebar pins, etc.) leaks into the next test unless we reset.
 *
 * Add a reset function here when a new module-singleton lands and
 * call it from `resetAll()` so `render()` automatically handles it.
 */
import { resetCapacitorPreferences, resetUuidCounter } from '../test-setup';

/** Drain notifications store. Reaches into the singleton via dynamic
 *  import so this helper compiles even before notifications.ts loads. */
export async function resetNotificationsStore(): Promise<void> {
  try {
    const mod = await import('$lib/notifications.svelte');
    mod.notifications.clear();
    // Reach into the unread-set if present (test-only escape hatch).
    if ('unreadIds' in mod.notifications) {
      (mod.notifications.unreadIds as Set<string>).clear();
    }
  } catch {
    // Module hasn't been imported by this test file -- nothing to reset.
  }
}

/** Confirm-gate timers + armed state. */
export async function resetConfirmGates(): Promise<void> {
  try {
    const mod = await import('$lib/confirm.svelte');
    if (typeof mod.ConfirmGate === 'function') {
      // ConfirmGate is per-instance; nothing module-level to clear.
    }
  } catch {
    /* not loaded */
  }
}

/** Tiny helper: invoke `mod.<key>()` if present, no-op otherwise.
 *  Module-singleton stores are dynamic-imported so this stays safe
 *  even when the module doesn't yet export the expected reset hook. */
function callIfPresent(mod: object, key: string): void {
  const fn = (mod as unknown as Record<string, unknown>)[key];
  if (typeof fn === 'function') {
    (fn as () => void)();
  }
}

/** Sidebar-pin store. */
export async function resetSidebarPins(): Promise<void> {
  try {
    const mod = await import('$lib/sidebar-pins.svelte');
    callIfPresent(mod, 'clear');
  } catch {
    /* not loaded */
  }
}

/** Global actions singleton. */
export async function resetGlobalActions(): Promise<void> {
  try {
    const mod = await import('$lib/global-actions.svelte');
    callIfPresent(mod, 'reset');
  } catch {
    /* not loaded */
  }
}

/** Theme store. */
export async function resetThemeStore(): Promise<void> {
  try {
    const mod = await import('$lib/theme.svelte');
    callIfPresent(mod, 'reset');
  } catch {
    /* not loaded */
  }
}

/** Online-status listener registry. */
export async function resetOnlineStore(): Promise<void> {
  try {
    const mod = await import('$lib/client/online-status.svelte');
    callIfPresent(mod, 'reset');
  } catch {
    /* not loaded */
  }
}

/**
 * Drain every known singleton. Called automatically by `render()` so
 * tests don't have to remember.
 */
export function resetAll(): void {
  // Synchronous resets first.
  resetCapacitorPreferences();
  resetUuidCounter();
  // Async resets fire-and-forget -- they only matter when the
  // corresponding module is already imported by the test file, in
  // which case the reset completes before the next event loop tick.
  void resetNotificationsStore();
  void resetConfirmGates();
  void resetSidebarPins();
  void resetGlobalActions();
  void resetThemeStore();
  void resetOnlineStore();
}
