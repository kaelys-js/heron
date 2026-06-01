<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { dev } from '$app/environment';
  import { Button } from '$lib/components/ui/button';
  import ErrorScreen from '$lib/components/ErrorScreen.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import { Home, RotateCw, ArrowLeft, LogIn } from '@lucide/svelte';
  import { docTitle } from '$lib/config/branding';
  import { reportError } from '$lib/client/error-reporter';
  import { onMount } from 'svelte';

  let status = $derived(page.status);
  let err = $derived(page.error);

  // Forward every error route to the unified reporter so it lands in the Issues
  // store + activity feed + OS notification (rate-limited).
  onMount(() => {
    if (page.error) {
      void reportError(page.error.message ?? 'Unknown route error', {
        source: '+error.svelte',
        route: page.url?.pathname,
        data: { status: page.status },
      });
    }
  });

  // Recovery action that best fits each class of error.
  type Recovery = 'home' | 'signin' | 'retry';
  type ErrorPreset = { title: string; description: string; accent: string; recovery: Recovery };

  // Human, non-blaming, actionable copy per status. SvelteKit routes EVERY
  // non-2xx through this one component (switching on status) -- there are no
  // per-code pages; this table is the single source of error copy.
  const presets: Record<number, ErrorPreset> = {
    400: {
      title: 'That request looked off',
      description: "The link or request didn't pass validation. Check it and try again.",
      accent: 'text-amber-400',
      recovery: 'home',
    },
    401: {
      title: 'Please sign in',
      description: 'You need to be signed in to see this.',
      accent: 'text-amber-400',
      recovery: 'signin',
    },
    403: {
      title: 'No access',
      description:
        "You don't have permission to view this. If that's unexpected, make sure you're signed in to the right account.",
      accent: 'text-red-400',
      recovery: 'signin',
    },
    404: {
      title: 'Page not found',
      description: "We couldn't find that page — it may have moved, or the link is out of date.",
      accent: 'text-muted-foreground',
      recovery: 'home',
    },
    500: {
      title: 'Something broke',
      description: "That's on us — the error's been logged. Give it another try in a moment.",
      accent: 'text-red-400',
      recovery: 'retry',
    },
    502: {
      title: 'Bad gateway',
      description: "An upstream service didn't respond. Try again shortly.",
      accent: 'text-red-400',
      recovery: 'retry',
    },
    503: {
      title: 'Temporarily unavailable',
      description: 'The server is briefly unavailable. Try again in a moment.',
      accent: 'text-amber-400',
      recovery: 'retry',
    },
  };

  // handleError appends ` · ref <uuid>` (+ a dev-only `\n::stack::\n<stack>`) to
  // the message so the catastrophic error.html fallback can surface the id +
  // dev-details. Strip both here when falling back to err.message for an unknown
  // status -- the id shows via errorId, the stack via the dev-details snippet.
  let cleanMessage = $derived(
    (err?.message ?? '').split('\n::stack::\n')[0].replace(/ · ref [0-9a-f-]+$/i, ''),
  );

  let preset = $derived<ErrorPreset>(
    presets[status] ?? {
      title: 'Something went wrong',
      description:
        cleanMessage || "An unexpected error occurred. We've logged it — try again or head home.",
      accent: 'text-red-400',
      recovery: 'retry',
    },
  );

  async function retry() {
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>{docTitle([status + ' · ' + preset.title])}</title>
</svelte:head>

<ErrorScreen
  {status}
  title={preset.title}
  description={preset.description}
  accent={preset.accent}
  errorId={err?.errorId}
>
  {#snippet actions()}
    <!-- Consistent recovery stack across every code: a code-appropriate primary
         (Sign in / Try again / Go home) + Go home (when not primary) + Go back —
         same Button, icon size, and gap, so 4xx and 5xx read identically. -->
    {#if preset.recovery === 'signin'}
      <Button onclick={() => goto('/login')} class="w-full gap-1.5">
        <LogIn class="size-4" />
        Sign in
      </Button>
      <Button variant="outline" onclick={() => goto('/')} class="w-full gap-1.5">
        <Home class="size-4" />
        Go home
      </Button>
    {:else if preset.recovery === 'retry'}
      <Button onclick={retry} class="w-full gap-1.5">
        <RotateCw class="size-4" />
        Try again
      </Button>
      <Button variant="outline" onclick={() => goto('/')} class="w-full gap-1.5">
        <Home class="size-4" />
        Go home
      </Button>
    {:else}
      <Button onclick={() => goto('/')} class="w-full gap-1.5">
        <Home class="size-4" />
        Go home
      </Button>
    {/if}
    <Button
      variant="ghost"
      onclick={() => history.back()}
      class="w-full gap-1.5 text-muted-foreground"
    >
      <ArrowLeft class="size-4" />
      Go back
    </Button>
  {/snippet}

  {#snippet details()}
    {#if dev && err}
      <!-- Dev-only diagnostics: a disclosure with a rotating chevron, a
           status/code chip, and the stack (or error object) in a copyable
           monospace block. Never rendered in production. -->
      <details class="group w-full rounded-lg border border-border/50 bg-muted/30 text-left">
        <summary
          class="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span
            aria-hidden="true"
            class="inline-block text-muted-foreground/60 transition-transform group-open:rotate-90"
            >▸</span
          >
          Developer details
          <span
            class="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70"
          >
            {status}{err.code ? ` · ${err.code}` : ''}
          </span>
        </summary>
        <div class="space-y-2 border-t border-border/50 px-3 py-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] text-muted-foreground">
              {err.stack ? 'Stack trace' : 'Error object'}
            </span>
            <CopyButton
              text={err.stack ?? JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}
              label="error details"
            />
          </div>
          <pre
            class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-2.5 text-[11px] font-mono leading-relaxed text-foreground/80">{err.stack ??
              JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}</pre>
        </div>
      </details>
    {/if}
  {/snippet}
</ErrorScreen>
