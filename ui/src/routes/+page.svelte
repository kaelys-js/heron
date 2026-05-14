<script lang="ts">
  /**
   * Client-side redirect companion to `+page.server.ts`.
   *
   * In the normal SSR runtime (node adapter, real requests), the server's
   * `load()` throws a 307 redirect and this component never renders. Under
   * adapter-static + Capacitor we have to skip the SSR redirect at build
   * time (see +page.server.ts) — so this component becomes the actual
   * landing UI for the fallback page. On mount, it forwards the user
   * exactly where the server would have sent them.
   *
   * The redirect is delayed by one tick (queueMicrotask) so the WebView
   * paints the loading state at least once before navigating away —
   * without that delay a slow Capacitor hydration sequence can drop the
   * first frame, look like a redirect loop to the user.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { BRAND } from '$lib/client/brand';

  onMount(() => {
    queueMicrotask(() => {
      // Critical: on Capacitor (non-http origin) we MUST NOT redirect
      // to /inbox without an auth check — the parent +layout.svelte's
      // auth gate runs in onMount too and there's no guaranteed
      // ordering between parent and child onMount. If our redirect to
      // /inbox wins the race the user lands on an app shell they
      // shouldn't see. Skip the inbox redirect when no auth flag is
      // present; the layout will steer them to /login.
      if (
        typeof window !== 'undefined' &&
        !window.location.protocol.startsWith('http') &&
        localStorage.getItem('career-ops:authed') !== '1'
      ) {
        // Layout will handle the /login redirect — stay put.
        return;
      }
      const u = page.url;
      const search = u.search;
      if (
        u.searchParams.has('from') ||
        u.searchParams.has('score') ||
        u.searchParams.has('search') ||
        u.searchParams.has('bg') ||
        u.searchParams.has('tab') ||
        u.searchParams.has('pdf') ||
        u.searchParams.has('report')
      ) {
        void goto('/pipeline' + search, { replaceState: true });
      } else {
        void goto('/inbox', { replaceState: true });
      }
    });
  });
</script>

<div
  class="flex min-h-screen items-center justify-center bg-background text-zinc-500"
  data-debug="root-page"
>
  <p class="text-sm">Loading {BRAND.displayName}…</p>
</div>
