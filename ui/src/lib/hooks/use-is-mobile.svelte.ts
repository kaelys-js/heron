/**
 * useIsMobile — shared reactive matchMedia hook.
 *
 * iOS HIG + Apple HIG: anything ≤ 768pt-wide is a "phone-shaped" context
 * and deserves bottom-sheet / drawer chrome instead of desktop-style
 * popovers + dropdowns. 768px matches Tailwind's `md` breakpoint so the
 * boundary is the same one used by `md:` utility classes throughout the
 * app — flip with viewport rotation on iPad and the layout follows.
 *
 * Returns a Svelte 5 rune-backed `$state` value the component reads as
 * a normal property; matchMedia subscription is set up on mount and
 * torn down on unmount via the returned cleanup function (idiomatic
 * Svelte 5 `onMount` shape).
 *
 * Use:
 *   import { useIsMobile } from '$lib/hooks/use-is-mobile.svelte';
 *   const isMobile = useIsMobile();
 *   // template:
 *   {#if isMobile.value} ...mobile UI... {:else} ...desktop UI... {/if}
 *
 * Why a hook instead of inlining matchMedia in every component:
 *   The same matchMedia query was duplicated across AgentChat.svelte,
 *   ResponsiveActionMenu, future components, etc. — easy to drift on
 *   the breakpoint, easy to forget the cleanup. Single hook = single
 *   source of truth = one place to change the breakpoint if Apple HIG
 *   ever updates it.
 */
import { onMount } from 'svelte';

const BREAKPOINT_QUERY = '(max-width: 768px)';

export function useIsMobile() {
  // svelte-ignore state_referenced_locally — initial seed; matchMedia
  // listener updates the value on mount.
  const store = $state({ value: false });

  onMount(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(BREAKPOINT_QUERY);
    store.value = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      store.value = e.matches;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  return store;
}
