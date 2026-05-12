<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Sparkles, Maximize2, Minimize2, ArrowUp, Plus, ChevronsUpDown } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  // === State ===
  //
  // Trade-off: the old version had a 3-state machine (collapsed / compact /
  // fullscreen) with hardcoded `top/right/bottom/left` calc()s. That broke
  // on iOS because the WebView's viewport math doesn't match desktop CSS,
  // and the resulting fullscreen overflowed the safe area. The fix is to
  // delegate panel positioning + animations to bits-ui Sheet — `side="bottom"`
  // for the mobile drawer, `side="right"` for the desktop side panel —
  // and toggle a width override for the desktop fullscreen mode.
  let chatOpen = $state(false);
  let fullscreen = $state(false); // desktop-only toggle
  let isMobile = $state(false);
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

  // Detect mobile breakpoint reactively. Tailwind's md = 768px so anything
  // narrower than that gets the bottom-drawer treatment. matchMedia is
  // observed live so rotating an iPad mid-session swaps the layout cleanly.
  onMount(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    isMobile = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      isMobile = e.matches;
      // Fullscreen has no meaning on mobile (the drawer is already as
      // big as it gets). Reset so re-entering desktop doesn't surprise
      // the user with a leftover fullscreen state.
      if (e.matches) fullscreen = false;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  async function openChat() {
    chatOpen = true;
    await tick();
    textareaEl?.focus();
  }

  function toggleFullscreen() {
    fullscreen = !fullscreen;
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
    // Sheet's own Escape handler closes the drawer; no need to duplicate.
  }
</script>

<Tooltip.Provider delayDuration={200}>
  <!--
    FAB — always rendered, hidden behind the Sheet's overlay when open.
    Doesn't unmount on open so the bottom-right anchor stays consistent.
    `pb-safe` keeps it clear of the home indicator on iOS.
  -->
  {#if !chatOpen}
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            transition:fade={{ duration: 150 }}
            onclick={openChat}
            aria-label="Open agent chat"
            class="group fixed z-50 size-12 rounded-full flex items-center justify-center transition-all duration-300 ease-out hover:scale-110 active:scale-95 bg-gradient-to-br from-foreground to-foreground/80 text-background shadow-[0_4px_24px_-4px_rgba(255,255,255,0.15),0_0_0_1px_rgba(255,255,255,0.06)] hover:shadow-[0_8px_32px_-4px_rgba(255,255,255,0.25),0_0_0_1px_rgba(255,255,255,0.12)] before:absolute before:inset-0 before:rounded-full before:bg-foreground/20 before:opacity-0 before:scale-100 before:transition-all hover:before:opacity-0 hover:before:scale-150 before:animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite]"
            style="bottom: calc(1.25rem + env(safe-area-inset-bottom)); right: calc(1.25rem + env(safe-area-inset-right));"
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
  {/if}

  <Sheet.Root bind:open={chatOpen}>
    <Sheet.Content
      side={isMobile ? 'bottom' : 'right'}
      showCloseButton={false}
      class={cn(
        'flex flex-col gap-0 p-0',
        // Mobile (bottom drawer): rounded top, ~85vh so the FAB tip peeks,
        // pb-safe pushes the input clear of the home indicator.
        isMobile && 'rounded-t-2xl h-[85svh] max-h-[85svh] pb-[env(safe-area-inset-bottom)]',
        // Desktop compact: ~420px wide, full-height right panel. The
        // Sheet primitive's default `data-[side=right]:sm:max-w-sm` would
        // cap at 384px — we override with our own width.
        !isMobile && !fullscreen && 'w-full sm:max-w-[420px]',
        // Desktop fullscreen: edge-to-edge takeover. !important needed
        // because the Sheet primitive sets a max-width via data attrs.
        !isMobile && fullscreen && 'w-screen sm:!max-w-none',
      )}
    >
      <!-- Mobile drag-handle (decorative; sheet dismisses via overlay-tap + Escape) -->
      {#if isMobile}
        <div
          class="mx-auto mt-2 mb-1 h-1 w-12 rounded-full bg-muted-foreground/30 flex-shrink-0"
          aria-hidden="true"
        ></div>
      {/if}

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
        <!-- Fullscreen toggle: desktop only. On mobile the drawer is already
             full-width, so the toggle has no meaning. -->
        {#if !isMobile}
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
                  {#if fullscreen}
                    <Minimize2 class="size-3.5" />
                  {:else}
                    <Maximize2 class="size-3.5" />
                  {/if}
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="bottom" class="text-xs"
              >{fullscreen ? 'Compact' : 'Fullscreen'}</Tooltip.Content
            >
          </Tooltip.Root>
        {/if}
        <Sheet.Close>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon" class="h-7 w-7" aria-label="Close chat">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="size-3.5"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </Button>
          {/snippet}
        </Sheet.Close>
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
                <span class="text-[11px] uppercase tracking-wide text-muted-foreground/70 px-1">
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
              rows={isMobile || fullscreen ? 3 : 2}
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
              <DropdownMenu.Label class="text-[11px] uppercase tracking-wide text-muted-foreground"
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
                  <span class="text-[11px] text-muted-foreground">{m.tag}</span>
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>
    </Sheet.Content>
  </Sheet.Root>
</Tooltip.Provider>
