/** Theme store -- runes-based singleton for light/dark mode.
 *  Modes: 'light' | 'dark' | 'system' (track OS, default).
 *  Persisted in localStorage under BRAND_STORAGE_KEYS.theme. The
 *  bootstrap script in app.html applies the resolved class BEFORE Svelte
 *  hydrates so there's no flash; this store keeps runtime in sync after
 *  hydration and reacts to OS-pref changes when in 'system'.
 *  Usage: theme.init() once on client, then theme.set(mode);
 *  theme.mode = raw setting, theme.resolved = always 'light'|'dark'. */

import { browser } from '$app/environment';
import { BRAND_STORAGE_KEYS } from '$lib/client/brand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

// Namespaced per brand so a fork's user state doesn't clash with upstream.
// Must match the inline bootstrap in app.html (which apply-brand keeps in sync).
const STORAGE_KEY = BRAND_STORAGE_KEYS.theme;

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
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
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
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {}
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
    // 'system' mode honours `prefers-color-scheme`. Returning 'dark' on
    // both branches was a latent bug that pinned every 'system' user to
    // dark mode after hydration (the inline app.html bootstrap got the
    // light/dark split right, then this overrode it). The SSR-only fallback
    // when `browser=false` stays 'dark' so the server-rendered HTML still
    // matches the dark-first default that app.html primes the class on.
    if (!browser) return 'dark';
    return this.mql?.matches ? 'dark' : 'light';
  }

  private apply(next: ResolvedTheme) {
    // No-op if the resolved theme didn't actually change (e.g. user
    // toggled from 'system' to 'dark' while system was already dark).
    // Avoids running the view-transition for nothing.
    const wasSame = this.resolved === next;
    this.resolved = next;
    if (!browser) return;

    const swap = () => {
      const root = document.documentElement;
      if (next === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
      root.style.colorScheme = next;
    };

    if (wasSame) {
      swap();
      return;
    }

    // Modern theme-swap animation via the View Transitions API
    // (Chrome 111+, Safari 18+, iOS WKWebView 18+). The browser
    // captures a full-viewport snapshot, applies the DOM change
    // inside the callback, then crossfades the new state over the
    // old -- single-shot GPU-composited transition, no per-element
    // CSS transitions, no FOUC. CSS keyframes attached to the
    // ::view-transition pseudo-elements live in app.css.
    //
    // Honour `prefers-reduced-motion` -- users with vestibular
    // disorders explicitly opt out of crossfades.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> };
    };
    if (!reduced && typeof doc.startViewTransition === 'function') {
      // `theme-swap` flag class scopes the view-transition CSS
      // overrides in app.css so the sidebar + topbar crossfade too
      // (during navigation they snap instead -- see view-transition
      // section in app.css). The flag is removed when the transition
      // completes OR if the browser cancels.
      const root = document.documentElement;
      root.classList.add('theme-swap');
      const t = doc.startViewTransition(swap);
      t.finished.finally(() => root.classList.remove('theme-swap'));
    } else {
      swap();
    }
  }
}

export const theme = new ThemeStore();
