<!--
  Theme toggle — responsive: bottom-sheet on mobile, dropdown on desktop.

  Uses the shared ResponsiveActionMenu primitive so the same markup
  works in both contexts; the underlying bits-ui Sheet vs DropdownMenu
  swap is hidden behind the primitive.

  The trigger icon morphs between sun / moon / monitor based on the
  resolved theme. The morph itself is a crossfade + scale-rotate so it
  feels like a smooth state change rather than an icon swap.
-->
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Sun, Moon, Monitor } from '@lucide/svelte';
  import { theme, type ThemeMode } from '$lib/theme.svelte';
  import ResponsiveActionMenu from './ResponsiveActionMenu.svelte';
  import ResponsiveActionItem from './ResponsiveActionItem.svelte';
  import { cn } from '$lib/utils';

  type Option = { value: ThemeMode; label: string; desc: string; icon: any };
  const OPTIONS: Option[] = [
    { value: 'light', label: 'Light', desc: 'Bright background, dark text', icon: Sun },
    { value: 'dark', label: 'Dark', desc: 'Dark background, light text', icon: Moon },
    { value: 'system', label: 'System', desc: 'Follows your device setting', icon: Monitor },
  ];

  // Pick the trigger icon based on what's RESOLVED so the user sees the
  // current actual state, not just their stored preference.
  let TriggerIcon = $derived(
    theme.mode === 'system' ? Monitor : theme.resolved === 'light' ? Sun : Moon,
  );

  let open = $state(false);
  // The trigger button's element, so the theme-swap reveal can radiate from the
  // toggle itself (the user's eye is already there) rather than a fixed corner.
  let triggerEl = $state<HTMLElement | null>(null);

  function choose(value: ThemeMode) {
    const r = triggerEl?.getBoundingClientRect();
    const origin = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined;
    theme.set(value, origin);
  }
</script>

<ResponsiveActionMenu
  bind:open
  title="Appearance"
  description="Pick the look you prefer."
  align="end"
  desktopWidth="w-56"
>
  {#snippet trigger({ props })}
    <Button
      {...props}
      bind:ref={triggerEl}
      variant="ghost"
      size="icon"
      class="h-9 w-9 relative overflow-hidden"
      aria-label="Theme: {theme.mode}"
    >
      <!--
        Crossfade between icons. Each is absolutely positioned and
        scales/rotates in/out keyed off the active state. Combined
        effect: the icon morphs as the theme changes.
      -->
      <span
        class={cn(
          'absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out',
          theme.mode === 'light'
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 -rotate-90 scale-50 pointer-events-none',
        )}
        aria-hidden="true"
      >
        <!-- amber-300 is too light on the cream light-mode bg (this icon is
             only ever shown when mode===light, i.e. on a light surface) — use
             a darker amber so it's clearly visible; still fine on dark. -->
        <Sun class="size-4 text-amber-500 dark:text-amber-300" />
      </span>
      <span
        class={cn(
          'absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out',
          theme.mode === 'dark'
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 rotate-90 scale-50 pointer-events-none',
        )}
        aria-hidden="true"
      >
        <Moon class="size-4 text-blue-300" />
      </span>
      <span
        class={cn(
          'absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out',
          theme.mode === 'system'
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 rotate-180 scale-50 pointer-events-none',
        )}
        aria-hidden="true"
      >
        <Monitor class="size-4 text-muted-foreground" />
      </span>
      <!-- Fallback icon for screen readers (the visual layer is aria-hidden) -->
      <TriggerIcon class="size-4 sr-only" />
    </Button>
  {/snippet}
  {#snippet items()}
    {#each OPTIONS as o}
      <ResponsiveActionItem
        onSelect={() => choose(o.value)}
        closeOnSelect={false}
        icon={o.icon}
        active={theme.mode === o.value}
        description={o.desc}
      >
        {o.label}
      </ResponsiveActionItem>
    {/each}
  {/snippet}
</ResponsiveActionMenu>
