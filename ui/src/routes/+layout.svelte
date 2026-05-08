<script lang="ts">
  import '../app.css';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import AgentChat from '$lib/components/AgentChat.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import AddJobDialog from '$lib/components/AddJobDialog.svelte';
  import { Toaster } from '$lib/components/ui/sonner';
  import { Button } from '$lib/components/ui/button';
  import { AlertTriangle, RefreshCw } from '@lucide/svelte';
  import { reportClientError } from '$lib/notifications.svelte';
  import { onNavigate } from '$app/navigation';
  import { APP_NAME, APP_DESCRIPTION } from '$lib/config/branding';
  import { theme } from '$lib/theme.svelte';
  import { onMount } from 'svelte';

  onMount(() => {
    // Hydrate the theme store so OS-preference changes propagate at runtime.
    // The inline app.html script already applied the initial class — this
    // just lights up the reactive store.
    theme.init();
  });

  let { children, data } = $props();

  function handleBoundaryError(err: unknown, _reset: () => void) {
    reportClientError('boundary', 'Component crashed', err);
  }

  function handleAgentError(err: unknown, _reset: () => void) {
    reportClientError('agent-chat', 'Agent chat crashed', err);
  }

  /**
   * View Transitions — fade routes when navigating. Progressively enhanced:
   * Chromium ships `document.startViewTransition`; Safari/Firefox skip and we
   * fall through to SvelteKit's default instant swap. The CSS animations live
   * in app.css under `::view-transition-{old,new}(root)` and respect
   * `prefers-reduced-motion`.
   */
  onNavigate((navigation) => {
    if (typeof document === 'undefined') return;
    const sxt = (document as any).startViewTransition;
    if (typeof sxt !== 'function') return;
    return new Promise<void>((resolve) => {
      sxt.call(document, async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<svelte:head>
  <!--
    Brand-derived meta lives here (not in app.html) so changing APP_NAME in
    src/lib/config/branding.ts updates every surface in one shot.
  -->
  <meta name="application-name" content={APP_NAME} />
  <meta name="apple-mobile-web-app-title" content={APP_NAME} />
  <meta name="description" content={APP_DESCRIPTION} />
  <meta property="og:title" content={APP_NAME} />
  <meta property="og:site_name" content={APP_NAME} />
</svelte:head>

<!--
  `h-svh overflow-hidden` locks the wrapper to viewport height so child pages with
  `h-full overflow-y-auto` actually scroll internally. Without this lock, content
  taller than viewport would push the wrapper to grow, breaking sticky topbars.
-->
<Sidebar.Provider class="h-svh overflow-hidden">
  <AppSidebar inboxCount={data?.inboxCount ?? 0} pinnedJobs={data?.pinnedJobs ?? []} />
  <Sidebar.Inset class="bg-card overflow-hidden">
    <svelte:boundary onerror={handleBoundaryError}>
      {@render children?.()}
      {#snippet failed(error, reset)}
        <div class="flex flex-col items-center justify-center min-h-[60vh] p-8 gap-3">
          <div class="flex flex-col items-center gap-2 max-w-md text-center">
            <div class="size-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle class="size-5 text-red-400" />
            </div>
            <h2 class="text-base font-semibold">This page crashed</h2>
            <p class="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <p class="text-xs text-muted-foreground/70">
              The error was logged to the activity feed. The rest of the app keeps running.
            </p>
            <div class="flex items-center gap-2 mt-2">
              <Button variant="outline" size="sm" onclick={reset} class="h-8 gap-1.5">
                <RefreshCw class="size-3" /> Retry
              </Button>
              <Button variant="ghost" size="sm" onclick={() => location.reload()} class="h-8">
                Reload page
              </Button>
            </div>
          </div>
        </div>
      {/snippet}
    </svelte:boundary>
  </Sidebar.Inset>
</Sidebar.Provider>

<svelte:boundary onerror={handleAgentError}>
  <AgentChat />
</svelte:boundary>
<GlobalSearch />
<AddJobDialog />
<Toaster />
