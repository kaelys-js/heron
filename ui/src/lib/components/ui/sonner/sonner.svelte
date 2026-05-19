<script lang="ts">
  import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
  import { mode } from 'mode-watcher';
  import Loader2Icon from '@lucide/svelte/icons/loader-2';
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
  import InfoIcon from '@lucide/svelte/icons/info';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
  theme={mode.current}
  class="toaster group"
  closeButton
  expand={false}
  richColors
  toastOptions={{
    classes: {
      // Shared close-button geometry -- applied to every variant so the
      // close X is a perfect circle (was reading as an oval because the
      // svelte-sonner default leaves both the button AND the SVG to
      // inherit Tailwind preflight reset, which can collapse line-height
      // and make the 20×20 box render at ~20×16 on some DPRs). Forcing
      // square box + square SVG + no padding nails the geometry.
      toast:
        'group/toast border shadow-lg ' +
        '[&_[data-close-button]]:!size-6 ' +
        '[&_[data-close-button]]:!p-0 ' +
        '[&_[data-close-button]]:!rounded-full ' +
        '[&_[data-close-button]]:!flex ' +
        '[&_[data-close-button]]:!items-center ' +
        '[&_[data-close-button]]:!justify-center ' +
        '[&_[data-close-button]>svg]:!size-3.5 ' +
        '[&_[data-close-button]>svg]:!aspect-square ' +
        '[&_[data-close-button]>svg]:!shrink-0',
      error:
        '!bg-red-950/90 !border-red-500/60 !text-red-50 !shadow-[0_4px_24px_-4px_rgba(239,68,68,0.35)] [&_[data-icon]]:!text-red-300 [&_[data-description]]:!text-red-200/85 [&_[data-close-button]]:!bg-red-900 [&_[data-close-button]]:!border-red-500/60 [&_[data-close-button]]:!text-red-100 [&_[data-button]]:!bg-red-500/30 [&_[data-button]]:!text-red-50 [&_[data-button]]:!border-red-400/40',
      warning:
        '!bg-amber-950/90 !border-amber-500/60 !text-amber-50 !shadow-[0_4px_24px_-4px_rgba(245,158,11,0.30)] [&_[data-icon]]:!text-amber-300 [&_[data-description]]:!text-amber-200/85 [&_[data-close-button]]:!bg-amber-900 [&_[data-close-button]]:!border-amber-500/60 [&_[data-close-button]]:!text-amber-100',
      success:
        '!bg-emerald-950/90 !border-emerald-500/50 !text-emerald-50 [&_[data-icon]]:!text-emerald-300 [&_[data-description]]:!text-emerald-200/85 [&_[data-close-button]]:!bg-emerald-900 [&_[data-close-button]]:!border-emerald-500/50 [&_[data-close-button]]:!text-emerald-100',
      info: '!bg-popover !text-popover-foreground !border-border [&_[data-icon]]:!text-blue-300',
    },
  }}
  style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
  {...restProps}
>
  {#snippet loadingIcon()}
    <Loader2Icon class="size-4 animate-spin" />
  {/snippet}
  {#snippet successIcon()}
    <CircleCheckIcon class="size-4" />
  {/snippet}
  {#snippet errorIcon()}
    <OctagonXIcon class="size-4" />
  {/snippet}
  {#snippet infoIcon()}
    <InfoIcon class="size-4" />
  {/snippet}
  {#snippet warningIcon()}
    <TriangleAlertIcon class="size-4" />
  {/snippet}
</Sonner>
