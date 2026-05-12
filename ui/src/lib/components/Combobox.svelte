<!--
  Searchable combobox built on Popover + Command. Used for fields where:
    * The list is long enough that a plain Select gets unwieldy (countries)
    * OR the list isn't exhaustive — users with niche values need to type
      their own (visa status, on-site availability, currencies for some
      regional flavours).

  API:
    items       — preset { value, label, description? } list
    value       — currently-selected value (raw string, persisted to disk)
    onchange    — fires when the user picks an item OR confirms a free-text entry
    allowCustom — when true, the user can type any value and Enter / blur saves it
                  exactly as typed. When false (a hard whitelist), free-text is
                  ignored and the input clears on close.
    placeholder — empty-state placeholder

  When `value` matches an item.value, we show item.label in the trigger.
  When it doesn't (custom value), we show the raw value with a small
  "(custom)" hint.
-->
<script lang="ts">
import * as Popover from '$lib/components/ui/popover';
import * as Command from '$lib/components/ui/command';
import { Button } from '$lib/components/ui/button';
import { Check, ChevronsUpDown, Pencil } from '@lucide/svelte';
import { cn } from '$lib/utils';

type Item = { value: string; label: string; description?: string };

let {
  items = [] as Item[],
  value = $bindable(''),
  onchange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  allowCustom = true,
  customLabel = 'Use as custom',
  disabled = false,
  class: className = '',
  ariaLabel,
  /** Optional value-formatter for the trigger label when no item matches. */
  formatCustom,
}: {
  items?: Item[];
  value?: string;
  onchange?: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
  customLabel?: string;
  disabled?: boolean;
  class?: string;
  ariaLabel?: string;
  formatCustom?: (v: string) => string;
} = $props();

let open = $state(false);
let search = $state('');

// Find the selected item's display label, OR fall back to "<raw> (custom)".
let selectedItem = $derived(
  items.find((i) => i.value.toLowerCase() === (value ?? '').toLowerCase()),
);
let displayLabel = $derived.by(() => {
  if (selectedItem) return selectedItem.label;
  if (value && value.trim()) return formatCustom ? formatCustom(value) : value;
  return '';
});

function commit(v: string) {
  value = v;
  onchange?.(v);
  open = false;
  search = '';
}

function onCustomSubmit() {
  const v = search.trim();
  if (!v || !allowCustom) return;
  commit(v);
}
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        variant="outline"
        {disabled}
        class={cn(
          'w-full h-9 justify-between text-sm font-normal',
          !displayLabel && 'text-muted-foreground',
          className,
        )}
      >
        <span class="flex items-center gap-1.5 min-w-0 truncate">
          {#if selectedItem == null && value && value.trim()}
            <Pencil class="size-3 text-muted-foreground/60 flex-shrink-0" />
          {/if}
          <span class="truncate">{displayLabel || placeholder}</span>
        </span>
        <ChevronsUpDown class="size-3.5 text-muted-foreground/60 flex-shrink-0 ml-2" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="p-0 w-[var(--bits-popover-anchor-width)]" align="start">
    <Command.Root>
      <Command.Input bind:value={search} placeholder={searchPlaceholder} />
      <Command.List class="max-h-64">
        <Command.Empty>
          {#if allowCustom && search.trim()}
            <button
              type="button"
              class="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2"
              onclick={onCustomSubmit}
            >
              <Pencil class="size-3.5 text-muted-foreground/70" />
              <span class="flex-1 min-w-0">
                <span class="font-medium">{customLabel}:</span>
                <span class="ml-1 text-muted-foreground">"{search}"</span>
              </span>
            </button>
          {:else}
            <div class="px-3 py-4 text-sm text-muted-foreground/80 text-center">
              {emptyText}
            </div>
          {/if}
        </Command.Empty>
        <Command.Group>
          {#each items as item (item.value)}
            {@const active = item.value.toLowerCase() === (value ?? '').toLowerCase()}
            <Command.Item
              value={item.value + ' ' + item.label + ' ' + (item.description ?? '')}
              onSelect={() => commit(item.value)}
              class="gap-2 items-start py-1.5"
            >
              <Check class={cn('size-3.5 mt-0.5 flex-shrink-0', active ? 'opacity-100 text-emerald-400' : 'opacity-0')} />
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium">{item.label}</div>
                {#if item.description}
                  <div class="text-[10px] text-muted-foreground/70 leading-tight">{item.description}</div>
                {/if}
              </div>
            </Command.Item>
          {/each}
          {#if allowCustom && search.trim() && !items.some((i) => i.label.toLowerCase().includes(search.toLowerCase()) || i.value.toLowerCase().includes(search.toLowerCase()))}
            <Command.Item
              value={'__custom__' + search}
              onSelect={onCustomSubmit}
              class="gap-2 items-start py-1.5 border-t border-border/40 mt-1 pt-2"
            >
              <Pencil class="size-3.5 mt-0.5 text-muted-foreground/60 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium">{customLabel}</div>
                <div class="text-[10px] text-muted-foreground/70 leading-tight font-mono">"{search}"</div>
              </div>
            </Command.Item>
          {/if}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
