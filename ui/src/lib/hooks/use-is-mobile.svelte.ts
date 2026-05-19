/**
 * useIsMobile -- singleton reactive matchMedia hook.
 *
 * iOS HIG + Apple HIG: anything ≤ 768pt-wide is a "phone-shaped" context
 * and deserves bottom-sheet / drawer chrome instead of desktop-style
 * popovers + dropdowns. 768px matches Tailwind's `md` breakpoint so the
 * boundary is the same one used by `md:` utility classes throughout the
 * app -- flip with viewport rotation on iPad and the layout follows.
 *
 * CRITICAL: this is a MODULE-LEVEL singleton, NOT per-component.
 * Pre-fix every call to `useIsMobile()` created a fresh `$state` that
 * mounted its own matchMedia listener. ResponsiveActionMenu (parent) +
 * ResponsiveActionItem (child) each called the hook, got separate
 * stores, and the stores updated independently on mount. During the
 * brief window between the parent flipping to mobile and the child
 * doing the same, the child rendered <DropdownMenu.Item> inside a
 * parent that had already switched to <Sheet.Content> -- bits-ui then
 * threw "ContextMenu.Content not found" because the Menu context was
 * not in scope. The fix is one shared store, one matchMedia listener,
 * and every component reads from the same source so flips are atomic.
 *
 * Use:
 *   import { useIsMobile } from '$lib/hooks/use-is-mobile.svelte';
 *   const isMobile = useIsMobile();
 *   {#if isMobile.value} ...mobile UI... {:else} ...desktop UI... {/if}
 */
import { onMount } from 'svelte';

const BREAKPOINT_QUERY = '(max-width: 768px)';

// Module-scoped singleton store. First-paint default false (no
// matchMedia on the server). The first component that mounts attaches
// the matchMedia listener; subsequent mounts no-op the listener setup
// but share the same store value.
const sharedStore = $state({ value: false });
let listenerAttached = false;
let mediaQuery: MediaQueryList | null = null;

function attachListener() {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  mediaQuery = window.matchMedia(BREAKPOINT_QUERY);
  sharedStore.value = mediaQuery.matches;
  const onChange = (e: MediaQueryListEvent) => {
    sharedStore.value = e.matches;
  };
  mediaQuery.addEventListener('change', onChange);
  // We deliberately don't tear down the listener -- the singleton lives
  // for the page lifetime. matchMedia listeners are O(1) and the page
  // unload cleans them up automatically. Adding teardown would mean
  // ref-counting consumers, which is complexity for no gain.
}

export function useIsMobile() {
  onMount(() => {
    attachListener();
  });
  return sharedStore;
}
