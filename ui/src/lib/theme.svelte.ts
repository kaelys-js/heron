/**
 * Theme store — runes-based singleton that drives light/dark mode.
 *
 * Three modes:
 *   - 'light'   — force light
 *   - 'dark'    — force dark
 *   - 'system'  — track OS preference (default)
 *
 * Persistence: localStorage key 'career-ops:theme' stores the user's choice.
 * The companion script in app.html applies the resolved class BEFORE Svelte
 * hydrates so there's no flash. This store keeps the runtime in sync after
 * hydration and reacts to OS changes when in 'system' mode.
 *
 * Usage:
 *   import { theme } from '$lib/theme.svelte';
 *   theme.init();              // call once on the client
 *   theme.set('light');        // user picks light
 *   theme.mode    -> 'light'   // raw setting
 *   theme.resolved -> 'light'  // what's actually applied (always concrete)
 */

import { browser } from '$app/environment';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'career-ops:theme';

class ThemeStore {
  // svelte-ignore state_referenced_locally
  mode = $state<ThemeMode>('system');
  // svelte-ignore state_referenced_locally
  resolved = $state<ResolvedTheme>('dark');

  private mql: MediaQueryList | null = null;
  private mqlHandler: ((e: MediaQueryListEvent) => void) | null = null;
  private inited = false;

  init() {
    if (!browser || this.inited) return;
    this.inited = true;
    // Read persisted mode (the inline app.html script already applied the
    // class; we just read the same value into reactive state here).
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
    this.mode = stored === 'light' || stored === 'dark' ? stored : 'system';
    this.mql = window.matchMedia('(prefers-color-scheme: dark)');
    this.mqlHandler = () => {
      // Only react to OS changes when the user has chosen 'system'
      if (this.mode === 'system') this.apply(this.mql!.matches ? 'dark' : 'light');
    };
    this.mql.addEventListener('change', this.mqlHandler);
    this.apply(this.computeResolved());
  }

  destroy() {
    if (this.mql && this.mqlHandler) {
      this.mql.removeEventListener('change', this.mqlHandler);
    }
    this.mql = null;
    this.mqlHandler = null;
    this.inited = false;
  }

  set(mode: ThemeMode) {
    this.mode = mode;
    if (browser) {
      try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
    }
    this.apply(this.computeResolved());
  }

  /** Toggle between explicit light <-> dark. Maps 'system' to its current resolved opposite. */
  toggle() {
    const next: ThemeMode = this.resolved === 'dark' ? 'light' : 'dark';
    this.set(next);
  }

  private computeResolved(): ResolvedTheme {
    if (this.mode === 'light') return 'light';
    if (this.mode === 'dark') return 'dark';
    return browser && this.mql?.matches ? 'dark' : 'dark';
  }

  private apply(next: ResolvedTheme) {
    this.resolved = next;
    if (!browser) return;
    const root = document.documentElement;
    if (next === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    root.style.colorScheme = next;
  }
}

export const theme = new ThemeStore();
