<!--
  ErrorScreen — the ONE shared base for every error / status surface (the root
  +error.svelte, the job +error.svelte, and mirrored in static error.html). It
  reuses the LOGIN screen's visual language so a 404/403/500 feels like the same
  app, not a generic gate: dawn-sky <BloomBackground />, the brand-mark hero, a
  large legible status numeral, a title + human copy, and a column of recovery
  actions.

  Renders inside the layout's <main> (authed → beside the sidebar; unauthed →
  full-screen), filling its container via min-h-svh — NOT a fixed overlay, so an
  in-app 404 keeps the user's navigation.

  The brand mark is the same AUTO-GENERATED:brand-mark marker every other surface
  uses; apply-brand fills the <image> (registered consumer in apply-brand.mjs).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import BloomBackground from '$lib/components/BloomBackground.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';

  let {
    status,
    title,
    description,
    accent = 'text-muted-foreground',
    errorId,
    actions,
    details,
  }: {
    /** HTTP-ish status numeral (404/500/…). Omit for non-HTTP failures (e.g. a
     *  client-side render crash) -- the large numeral is then skipped and the
     *  brand-mark hero leads straight into the title. */
    status?: number | string;
    title: string;
    description: string;
    /** Tailwind text-color class for the status numeral (e.g. text-red-400). */
    accent?: string;
    /** Correlation id from handleError -- shown (short) + copyable (full) so a
     *  user can quote it to support; the same id is in the server/client logs. */
    errorId?: string;
    /** Recovery buttons (rendered full-width in a column). */
    actions?: Snippet;
    /** Optional extra block under the actions (e.g. dev-only error details). */
    details?: Snippet;
  } = $props();

  // Move focus to the error heading when it renders so keyboard + screen-reader
  // users LAND on the error instead of staying at their prior focus (SC 2.4.3).
  // preventScroll keeps it motion-free; the page is already centred on the h1.
  let headingEl = $state<HTMLElement | null>(null);
  onMount(() => headingEl?.focus({ preventScroll: true }));
</script>

<div
  class="relative flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-background px-6 py-12"
>
  <BloomBackground />

  <div class="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
    <!-- Brand mark hero — same composition as /login + boot-fallback. -->
    <div class="brand-hero-glow mb-6 flex size-16 items-center justify-center" aria-hidden="true">
      <svg width="64" height="64" viewBox="0 0 1024 1024">
        <!-- AUTO-GENERATED:brand-mark gradient-id="errscreen-bg" -->
        <image
          width="1024"
          height="1024"
          preserveAspectRatio="xMidYMid meet"
          href="data:image/webp;base64,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"
        />
        <!-- /AUTO-GENERATED:brand-mark -->
      </svg>
    </div>

    <!-- Decorative numeral (HTTP errors only): the cohesive "Error {status}:
         {title}" lives on the h1's aria-label so the number isn't read twice.
         Omitted for non-HTTP failures (status undefined) — e.g. a render crash. -->
    {#if status !== undefined}
      <p
        class="font-mono text-5xl font-bold tabular-nums tracking-tight {accent}"
        aria-hidden="true"
      >
        {status}
      </p>
    {/if}
    <h1
      bind:this={headingEl}
      tabindex="-1"
      aria-label={status !== undefined ? `Error ${status}: ${title}` : title}
      class="{status === undefined
        ? 'mt-2'
        : 'mt-3'} text-2xl font-semibold tracking-tight text-foreground focus:outline-none"
    >
      {title}
    </h1>
    <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

    {#if actions}
      <div class="mt-7 flex w-full flex-col gap-2">
        {@render actions()}
      </div>
    {/if}

    {#if errorId}
      <!-- Correlation reference: short, glanceable code on screen; the copy
           button writes the FULL id (what's in the logs) for support. -->
      <div class="mt-6 flex flex-col items-center gap-1 text-xs text-muted-foreground">
        <div class="flex items-center gap-2">
          <span>Reference</span>
          <code class="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-foreground/80">
            err_{errorId.slice(0, 8)}
          </code>
          <CopyButton text={errorId} label="error reference" />
        </div>
        <span class="text-[11px]">Quote this if you contact support</span>
      </div>
    {/if}

    {#if details}
      <div class="mt-6 w-full text-left">
        {@render details()}
      </div>
    {/if}
  </div>
</div>
