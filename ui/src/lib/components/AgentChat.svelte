<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Card from '$lib/components/ui/card';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import {
    Sparkles,
    Maximize2,
    Minimize2,
    Minus,
    ArrowUp,
    Plus,
    ChevronsUpDown,
  } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  type ChatState = 'collapsed' | 'compact' | 'fullscreen';
  let chatState: ChatState = $state('collapsed');
  let history: { role: 'user' | 'assistant'; content: string }[] = $state([]);
  let input = $state('');
  let loading = $state(false);
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let scrollEl: HTMLDivElement | null = $state(null);

  // Latest models (Opus 4.7 / Sonnet 4.6 / Haiku 4.5)
  const MODELS = [
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tag: 'balanced' },
    { id: 'claude-opus-4-7', label: 'Opus 4.7', tag: 'most capable' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5', tag: 'fastest' },
  ];
  let selectedModel = $state(MODELS[0]);

  async function expand(toState: ChatState = 'compact') {
    chatState = toState;
    await tick();
    textareaEl?.focus();
  }

  function collapse() {
    chatState = 'collapsed';
  }

  function toggleFullscreen() {
    chatState = chatState === 'fullscreen' ? 'compact' : 'fullscreen';
  }

  function newChat() {
    history = [];
    input = '';
    textareaEl?.focus();
  }

  async function send() {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    input = '';
    history = [...history, { role: 'user', content: msg }];
    loading = true;
    await tick();
    scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
    try {
      const r = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, model: selectedModel.id }),
      });
      const j = await r.json();
      history = [
        ...history,
        { role: 'assistant', content: j.ok ? j.reply : '⚠ ' + (j.error || 'error') },
      ];
    } catch (e: any) {
      history = [...history, { role: 'assistant', content: '⚠ ' + e.message }];
    } finally {
      loading = false;
      await tick();
      scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
    }
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      collapse();
    }
  }
</script>

<Tooltip.Provider delayDuration={200}>
  {#if chatState === 'collapsed'}
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            transition:fade={{ duration: 150 }}
            onclick={() => expand('compact')}
            aria-label="Open agent chat"
            class="group fixed bottom-5 right-5 z-50 size-12 rounded-full flex items-center justify-center transition-all duration-300 ease-out hover:scale-110 active:scale-95 bg-gradient-to-br from-foreground to-foreground/80 text-background shadow-[0_4px_24px_-4px_rgba(255,255,255,0.15),0_0_0_1px_rgba(255,255,255,0.06)] hover:shadow-[0_8px_32px_-4px_rgba(255,255,255,0.25),0_0_0_1px_rgba(255,255,255,0.12)] before:absolute before:inset-0 before:rounded-full before:bg-foreground/20 before:opacity-0 before:scale-100 before:transition-all hover:before:opacity-0 hover:before:scale-150 before:animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite]"
          >
            <Sparkles
              class="size-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110"
            />
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="left" sideOffset={8} class="text-xs">
        <div class="flex flex-col gap-0.5">
          <span class="font-medium">Chat with your agents</span>
          <span class="text-muted-foreground">⌘ + .</span>
        </div>
      </Tooltip.Content>
    </Tooltip.Root>
  {:else}
    <div
      transition:fly={{ y: 20, duration: 200, easing: quintOut }}
      class="fixed z-50 flex flex-col transition-[top,right,bottom,left] duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[top,right,bottom,left]"
      style:top={chatState === 'fullscreen' ? '2rem' : 'calc(100vh - 596px)'}
      style:right={chatState === 'fullscreen' ? '10vw' : '1rem'}
      style:bottom={chatState === 'fullscreen' ? '2rem' : '1rem'}
      style:left={chatState === 'fullscreen' ? '10vw' : 'calc(100vw - 416px)'}
    >
      <Card.Root
        class="flex-1 flex flex-col overflow-hidden border shadow-2xl bg-popover/95 backdrop-blur-xl p-0 gap-0"
      >
        <header class="flex items-center gap-1 px-3 py-2 border-b flex-shrink-0">
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="h-7 w-7" onclick={newChat}>
                  <Plus class="size-3.5" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="bottom" class="text-xs">New chat</Tooltip.Content>
          </Tooltip.Root>
          <span class="text-sm font-medium flex-1 truncate">New chat</span>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  onclick={toggleFullscreen}
                >
                  {#if chatState === 'fullscreen'}
                    <Minimize2 class="size-3.5" />
                  {:else}
                    <Maximize2 class="size-3.5" />
                  {/if}
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="bottom" class="text-xs"
              >{chatState === 'fullscreen' ? 'Compact' : 'Fullscreen'}</Tooltip.Content
            >
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="h-7 w-7" onclick={collapse}>
                  <Minus class="size-3.5" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="bottom" class="text-xs">Minimize</Tooltip.Content>
          </Tooltip.Root>
        </header>

        <div bind:this={scrollEl} class="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {#if history.length === 0}
            <div class="h-full flex flex-col items-center justify-center text-center px-6 py-8">
              <div
                class="size-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 ring-1 ring-primary/20"
              >
                <Sparkles class="size-5 text-primary" />
              </div>
              <p class="text-sm font-medium">Chat with your agents</p>
              <p class="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-xs">
                They know your workspace —
                <span class="text-foreground">jobs, applications, skills</span>.
              </p>
              <p class="text-xs text-muted-foreground mt-2 leading-relaxed max-w-xs">
                Ask for a summary, plan your day, or hand off a quick task.
              </p>
            </div>
          {:else}
            <div class="space-y-4">
              {#each history as turn, i (i)}
                <div
                  class={cn(
                    'flex flex-col gap-1',
                    turn.role === 'user' ? 'items-end' : 'items-start',
                  )}
                >
                  <span class="text-[10px] uppercase tracking-wide text-muted-foreground/70 px-1">
                    {turn.role === 'user' ? 'You' : selectedModel.label}
                  </span>
                  <div
                    class={cn(
                      'max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                      turn.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-foreground',
                    )}
                  >
                    {turn.content}
                  </div>
                </div>
              {/each}
              {#if loading}
                <div class="flex items-center gap-2 text-xs text-muted-foreground italic px-1">
                  <span class="flex gap-0.5">
                    <span
                      class="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse"
                      style="animation-delay: 0ms"
                    ></span>
                    <span
                      class="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse"
                      style="animation-delay: 150ms"
                    ></span>
                    <span
                      class="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse"
                      style="animation-delay: 300ms"
                    ></span>
                  </span>
                  thinking…
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div class="flex-shrink-0 border-t bg-muted/30">
          <div class="px-3 py-3">
            <div class="flex items-end gap-2">
              <Textarea
                bind:ref={textareaEl}
                bind:value={input}
                placeholder="Tell me what to do…"
                disabled={loading}
                onkeydown={handleKey}
                rows={chatState === 'fullscreen' ? 3 : 2}
                class="resize-none border-border/40 bg-background text-sm focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground/50 min-h-[40px] flex-1"
              />
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      onclick={send}
                      disabled={loading || !input.trim()}
                      size="icon"
                      class="size-9 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground transition-all"
                    >
                      <ArrowUp class="size-4" />
                    </Button>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="top" class="text-xs"
                  >Send <span class="text-muted-foreground ml-1">⌘ + ↵</span></Tooltip.Content
                >
              </Tooltip.Root>
            </div>
          </div>
          <div class="flex items-center gap-2 px-3 pb-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <button
                    {...props}
                    class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors h-6 px-2 rounded hover:bg-muted/60"
                  >
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    <span>{selectedModel.label}</span>
                    <ChevronsUpDown class="size-3" />
                  </button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content side="top" align="start" class="w-52">
                <DropdownMenu.Label
                  class="text-[10px] uppercase tracking-wide text-muted-foreground"
                  >Model</DropdownMenu.Label
                >
                {#each MODELS as m}
                  <DropdownMenu.Item
                    onSelect={() => (selectedModel = m)}
                    class={cn(
                      'flex items-center justify-between gap-2 cursor-pointer',
                      selectedModel.id === m.id && 'bg-accent',
                    )}
                  >
                    <span class="text-sm">{m.label}</span>
                    <span class="text-[10px] text-muted-foreground">{m.tag}</span>
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
        </div>
      </Card.Root>
    </div>
  {/if}
</Tooltip.Provider>
