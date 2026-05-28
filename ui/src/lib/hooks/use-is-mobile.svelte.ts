/** Singleton matchMedia hook keyed at 768px (Tailwind `md` breakpoint
 *  + Apple HIG phone width). MUST be module-level: per-component
 *  `$state` would mount one matchMedia listener per call and parent +
 *  child renders would flip on different ticks, tearing down bits-ui
 *  menu context mid-render. Use:
 *    const isMobile = useIsMobile();
 *    {#if isMobile.value} ... mobile ... {:else} ... desktop ... {/if} */
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
  if (listenerAttached || typeof window === 'undefined') {
    return;
  }
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
