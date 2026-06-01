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
  position="top-center"
  offset="calc(env(safe-area-inset-top) + 0.5rem)"
  closeButton
  expand={false}
  richColors
  toastOptions={{
    classes: {
      // Shared close-button geometry. svelte-sonner positions the close
      // button `position:absolute` with `top:0` AND a `bottom`, so it
      // STRETCHES to the full toast height (which is tall for a title +
      // multi-line description) and reads as a vertical oval. Pinning only
      // `size-*` (height: calc(var(--spacing)*n)) doesn't beat the
      // top+bottom stretch. Force `bottom:auto` + a literal min/max height
      // so the box is a true square regardless of toast height; the SVG is
      // a fixed square so it can't be compressed by the flex row either.
      toast:
        'group/toast border shadow-lg ' +
        // Brand voice on the toast title: Fraunces serif + tight tracking,
        // matching the app's heading scale. `data-title` is svelte-sonner's
        // title node; the !important wins over the lib's default title style.
        '[&_[data-title]]:!font-serif ' +
        '[&_[data-title]]:!tracking-tight ' +
        '[&_[data-close-button]]:!top-2 ' +
        '[&_[data-close-button]]:!bottom-auto ' +
        '[&_[data-close-button]]:!h-[22px] ' +
        '[&_[data-close-button]]:!max-h-[22px] ' +
        '[&_[data-close-button]]:!min-h-[22px] ' +
        '[&_[data-close-button]]:!w-[22px] ' +
        '[&_[data-close-button]]:!p-0 ' +
        '[&_[data-close-button]]:!rounded-full ' +
        '[&_[data-close-button]]:!flex ' +
        '[&_[data-close-button]]:!items-center ' +
        '[&_[data-close-button]]:!justify-center ' +
        '[&_[data-close-button]>svg]:!h-[13px] ' +
        '[&_[data-close-button]>svg]:!w-[13px] ' +
        '[&_[data-close-button]>svg]:!shrink-0',
      error:
        '!bg-red-950/90 !border-red-500/60 !text-red-50 !shadow-[0_4px_24px_-4px_rgba(239,68,68,0.35)] [&_[data-icon]]:!text-red-300 [&_[data-description]]:!text-red-200/85 [&_[data-close-button]]:!bg-red-900 [&_[data-close-button]]:!border-red-500/60 [&_[data-close-button]]:!text-red-100 [&_[data-button]]:!bg-red-500/30 [&_[data-button]]:!text-red-50 [&_[data-button]]:!border-red-400/40',
      warning:
        '!bg-amber-950/90 !border-amber-500/60 !text-amber-50 !shadow-[0_4px_24px_-4px_rgba(245,158,11,0.30)] [&_[data-icon]]:!text-amber-300 [&_[data-description]]:!text-amber-200/85 [&_[data-close-button]]:!bg-amber-900 [&_[data-close-button]]:!border-amber-500/60 [&_[data-close-button]]:!text-amber-100',
      success:
        '!bg-emerald-950/90 !border-emerald-500/50 !text-emerald-50 [&_[data-icon]]:!text-emerald-300 [&_[data-description]]:!text-emerald-200/85 [&_[data-close-button]]:!bg-emerald-900 [&_[data-close-button]]:!border-emerald-500/50 [&_[data-close-button]]:!text-emerald-100',
      // Neutral / info toast carries a gold brand accent rail on the leading
      // edge (--primary: gold in dark, slate in light) so system-state
      // messages read as Heron's voice rather than generic chrome.
      info:
        '!bg-popover !text-popover-foreground !border-border ' +
        '!border-l-2 !border-l-primary ' +
        '[&_[data-icon]]:!text-info',
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
