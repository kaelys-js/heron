<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { AlertTriangle, RefreshCw, FileText } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import { dev } from '$app/environment';
  import { BRAND_EVENTS } from '$lib/client/brand';
  import CopyButton from '$lib/components/CopyButton.svelte';

  /**
   * Generic <svelte:boundary> wrapper with a rich default fail panel.
   *
   * The previous version showed just an icon + one-line message + a
   * "Try again" button. That made every render error look identical
   * and trivial, but most of them aren't -- a crash here is the user's
   * one chance to see what went wrong. The expanded panel:
   *   • leads with a calm, human reassurance line
   *   • formats the message in a code-styled monospace block
   *   • exposes the stack trace + error TYPE behind a dev-only
   *     <details> disclosure (never shown to end users -- the raw
   *     JS stack is a production info-leak), with a CopyButton
   *   • offers both "Try again" (reset the boundary) and
   *     "Open activity log" (open the notifications panel which
   *     already has the error logged via reportError())
   *
   * The activity-log button dispatches BRAND_EVENTS.openNotifications,
   * which NotificationsBell.svelte already listens for. No new wiring
   * needed beyond emitting the event.
   *
   * Use anywhere a render error in a child component should NOT take
   * down the rest of the page (agent chat, global dialogs, optional
   * widgets). Pass `failedRender` to fully customise the failure UI;
   * leave undefined for the built-in panel below.
   */
  let {
    title = 'Something went wrong',
    children,
    failedRender,
    onretry,
  }: {
    title?: string;
    children?: Snippet;
    failedRender?: Snippet<[unknown, () => void]>;
    onretry?: () => void;
  } = $props();

  function openActivityLog() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BRAND_EVENTS.openNotifications));
    }
  }

  function errorType(err: unknown): string {
    if (err instanceof Error) return err.constructor.name || 'Error';
    return typeof err;
  }

  function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message || String(err);
    return typeof err === 'string' ? err : JSON.stringify(err, null, 2);
  }

  function errorStack(err: unknown): string | null {
    if (err instanceof Error && err.stack) return err.stack;
    return null;
  }
</script>

<svelte:boundary>
  {@render children?.()}
  {#snippet failed(error, reset)}
    {#if failedRender}
      {@render failedRender(error, reset)}
    {:else}
      <div
        role="alert"
        class="relative flex flex-col gap-3 p-5 rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/5 via-card to-card overflow-hidden"
      >
        <!-- Subtle red glow stripe at the top — signals "something failed"
             without screaming. -->
        <div
          class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent"
        ></div>

        <div class="flex items-start gap-3">
          <div
            class="size-10 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0"
          >
            <AlertTriangle class="size-5 text-red-400" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-base font-semibold text-foreground">{title}</h3>
            <p class="text-xs text-muted-foreground mt-0.5">
              The rest of the app keeps running — this was logged to the activity feed.
            </p>
          </div>
        </div>

        <!-- Error message in a code-styled block. Wraps long lines so
             the boundary doesn't horizontally scroll its parent. -->
        <pre
          class="text-xs font-mono leading-relaxed bg-muted/40 border border-border/50 rounded-md p-3 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-foreground/90">{errorMessage(
            error,
          )}</pre>

        {#if dev && errorStack(error)}
          <!-- Dev-only diagnostics: the raw JS stack is an info-leak in
               production, so this disclosure (plus the error-type chip and
               CopyButton) only renders under `dev`. -->
          <details class="group">
            <summary
              class="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground transition-colors select-none flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                class="inline-block transition-transform group-open:rotate-90 text-muted-foreground/60"
                >▸</span
              >
              Stack trace
              <span
                class="ml-1 font-mono text-[10px] text-red-300/80 bg-red-500/10 px-1.5 py-0.5 rounded"
                >{errorType(error)}</span
              >
            </summary>
            <div class="mt-2 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] text-muted-foreground">Stack trace</span>
                <CopyButton text={errorStack(error) ?? ''} label="stack trace" />
              </div>
              <pre
                class="p-3 text-[11px] font-mono leading-snug bg-muted/30 border border-border/40 rounded-md max-h-48 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">{errorStack(
                  error,
                )}</pre>
            </div>
          </details>
        {/if}

        <div class="flex items-center gap-2 mt-1">
          <Button
            size="sm"
            class="h-8 gap-1.5"
            onclick={() => {
              onretry?.();
              reset();
            }}
          >
            <RefreshCw class="size-3.5" /> Try again
          </Button>
          <Button variant="ghost" size="sm" class="h-8 gap-1.5" onclick={openActivityLog}>
            <FileText class="size-3.5" /> Open activity log
          </Button>
        </div>
      </div>
    {/if}
  {/snippet}
</svelte:boundary>
