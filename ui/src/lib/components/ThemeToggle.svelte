<!--
  Theme toggle — dropdown next to the NotificationsBell with three options
  (Light, Dark, System) and a CheckMark for the active one.

  The trigger icon morphs between sun / moon / monitor based on the resolved
  theme. The morph itself is a crossfade + scale-rotate so it feels like a
  smooth state change rather than an icon swap.
-->
<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import { Sun, Moon, Monitor } from '@lucide/svelte';
  import CheckMark from './CheckMark.svelte';
  import { theme, type ThemeMode } from '$lib/theme.svelte';
  import { cn } from '$lib/utils';

  type Option = { value: ThemeMode; label: string; desc: string; icon: any };
  const OPTIONS: Option[] = [
    { value: 'light', label: 'Light', desc: 'Always light', icon: Sun },
    { value: 'dark', label: 'Dark', desc: 'Always dark', icon: Moon },
    { value: 'system', label: 'System', desc: 'Follow OS preference', icon: Monitor },
  ];

  // Pick the trigger icon based on what's RESOLVED so the user sees the
  // current actual state, not just their stored preference.
  let TriggerIcon = $derived(
    theme.mode === 'system' ? Monitor : theme.resolved === 'light' ? Sun : Moon,
  );
</script>

<DropdownMenu.Root>
  <Tooltip.Provider delayDuration={300}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props: tipProps })}
          <DropdownMenu.Trigger>
            {#snippet child({ props: ddProps })}
              <Button
                {...tipProps}
                {...ddProps}
                variant="ghost"
                size="icon"
                class="h-8 w-8 relative overflow-hidden"
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
                  <Sun class="size-4 text-amber-300" />
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
          </DropdownMenu.Trigger>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="bottom" class="text-xs">
        Theme: <span class="font-medium"
          >{theme.mode === 'system' ? 'System (' + theme.resolved + ')' : theme.mode}</span
        >
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
  <DropdownMenu.Content side="bottom" align="end" class="w-44">
    <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground"
      >Appearance</DropdownMenu.Label
    >
    {#each OPTIONS as o}
      {@const Icon = o.icon}
      {@const active = theme.mode === o.value}
      <DropdownMenu.Item
        onSelect={() => theme.set(o.value)}
        closeOnSelect={false}
        class="gap-2 items-start py-1.5"
      >
        <Icon
          class={cn(
            'size-3.5 mt-0.5 flex-shrink-0 transition-colors',
            active
              ? o.value === 'light'
                ? 'text-amber-300'
                : o.value === 'dark'
                  ? 'text-blue-300'
                  : 'text-foreground'
              : 'text-muted-foreground',
          )}
        />
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium">{o.label}</div>
          <div class="text-[10px] text-muted-foreground/70 leading-tight">{o.desc}</div>
        </div>
        <CheckMark {active} class="mt-0.5" />
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
