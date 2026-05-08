<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { X, Plus } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { ConfirmGate } from '$lib/confirm.svelte';
  import { onDestroy } from 'svelte';

  let {
    items = $bindable([]),
    placeholder = 'Add an item…',
    emptyText = 'Nothing yet — add your first item below.',
    onchange,
    class: className,
  }: {
    items: string[];
    placeholder?: string;
    emptyText?: string;
    onchange?: (next: string[]) => void;
    class?: string;
  } = $props();

  let draft = $state('');

  // One gate per editor instance — keys are chip-index strings so several
  // chips can be in differing armed states without affecting each other.
  // (Only one is ever armed at a time, but conceptually every X has its own
  // confirm state.)
  const confirm = new ConfirmGate();
  onDestroy(() => confirm.destroy());

  function commit(next: string[]) {
    items = next;
    onchange?.(next);
  }

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      draft = '';
      return;
    }
    commit([...items, v]);
    draft = '';
  }

  function remove(idx: number) {
    if (!confirm.trigger('chip:' + idx)) return;
    commit(items.filter((_, i) => i !== idx));
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && draft === '' && items.length > 0) {
      // Backspace on empty input is a known keyboard shortcut — single-action
      // intent (the user is actively typing), so skip the confirm gate.
      e.preventDefault();
      commit(items.slice(0, -1));
    }
  }
</script>

<div class={cn('space-y-2', className)}>
  {#if items.length > 0}
    <Tooltip.Provider delayDuration={350}>
      <div class="flex flex-wrap gap-1.5">
        {#each items as item, i (item + ':' + i)}
          {@const armed = confirm.isArmed('chip:' + i)}
          <span
            class={cn(
              'inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md text-[11px] border group/chip transition-colors',
              armed
                ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/30'
                : 'bg-muted border-border/50',
            )}
          >
            <span class={cn('font-medium', armed && 'text-red-200')}>{item}</span>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <button
                    {...props}
                    type="button"
                    onclick={(e) => { e.preventDefault(); e.stopPropagation(); remove(i); }}
                    aria-label={armed ? 'Click again to remove ' + item : 'Remove ' + item}
                    class={cn(
                      'size-4 flex items-center justify-center rounded transition-colors',
                      armed
                        ? 'text-red-300 bg-red-500/20 hover:bg-red-500/30 animate-pulse'
                        : 'text-muted-foreground/60 hover:text-red-300 hover:bg-red-500/10',
                    )}
                  >
                    <X class="size-3" />
                  </button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content side="top" class="text-xs">
                {armed ? 'Click again to remove "' + item + '"' : 'Remove "' + item + '"'}
              </Tooltip.Content>
            </Tooltip.Root>
          </span>
        {/each}
      </div>
    </Tooltip.Provider>
  {:else}
    <p class="text-[11px] text-muted-foreground/60 italic">{emptyText}</p>
  {/if}
  <div class="flex items-center gap-2">
    <Input
      bind:value={draft}
      onkeydown={onKey}
      {placeholder}
      class="h-8 text-sm flex-1"
    />
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="h-8 gap-1"
      disabled={!draft.trim()}
      onclick={add}
    >
      <Plus class="size-3.5" /> Add
    </Button>
  </div>
</div>
