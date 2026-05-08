<script lang="ts">
  import * as Sidebar from '$lib/components/ui/sidebar';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import CollapsibleGroup from './CollapsibleGroup.svelte';
  import {
    Inbox, ListTodo, Pin, KanbanSquare, FolderKanban, PlayCircle, Bot, ListChecks,
    Cpu, Wrench, Settings as SettingsIcon, ChevronsUpDown, Search, Plus,
    HelpCircle, BarChart3, MoreHorizontal, Star, Trash2, User, Lightbulb,
  } from '@lucide/svelte';
  import { page } from '$app/state';
  import { onMount, onDestroy } from 'svelte';
  import { pinStore } from '$lib/sidebar-pins.svelte';
  import { globalActions } from '$lib/global-actions.svelte';
  import { cn } from '$lib/utils';
  import { APP_NAME, APP_TAGLINE } from '$lib/config/branding';
  import { ConfirmGate } from '$lib/confirm.svelte';

  type PinnedJob = { id: string; company: string; role: string };
  let { inboxCount = 0, queueCount = 0, pinnedJobs = [] }: {
    inboxCount?: number;
    queueCount?: number;
    pinnedJobs?: PinnedJob[];
  } = $props();

  let pathname = $derived(page.url.pathname);
  let isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

  const workspace = { name: APP_NAME, tagline: APP_TAGLINE };

  onMount(() => {
    pinStore.init();
  });

  let visiblePins = $derived(pinnedJobs.filter((j) => !pinStore.isExcluded(j.id)));

  // Single gate guards both per-job unpin AND "unpin all" so the user always
  // gets the same red double-click pattern across the sidebar.
  const confirm = new ConfirmGate();
  onDestroy(() => confirm.destroy());
  let pinnedMenuOpen = $state(false);

  function onUnpinAllClick(e: Event) {
    e.preventDefault();
    if (!confirm.trigger('unpin-all')) return;
    pinStore.unpinAll(visiblePins.map((j) => j.id));
    pinnedMenuOpen = false;
  }

  function onMenuOpenChange(v: boolean) {
    pinnedMenuOpen = v;
    // Closing the menu cancels any pending unpin-all confirm
    if (!v && confirm.isArmed('unpin-all')) confirm.disarm();
  }

  function unpinOne(id: string, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm.trigger('unpin:' + id)) return;
    pinStore.unpin(id);
  }
</script>

<Sidebar.Root collapsible="icon" variant="inset" class="app-shell-sidebar">
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Sidebar.MenuButton {...props} size="lg" class="data-[state=open]:bg-sidebar-accent">
                <div class="relative flex aspect-square size-8 items-center justify-center rounded-lg bg-zinc-900 ring-1 ring-zinc-800 overflow-hidden">
                  <svg viewBox="0 0 32 32" class="size-5" aria-hidden="true">
                    <rect x="6.5" y="11" width="19" height="13.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6" class="text-zinc-200"/>
                    <path d="M12 11v-1.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" class="text-zinc-200"/>
                    <line x1="6.5" y1="17.5" x2="25.5" y2="17.5" stroke="currentColor" stroke-width="1.2" opacity="0.55" class="text-zinc-200"/>
                    <rect x="14" y="16.4" width="4" height="2.2" rx="0.5" fill="currentColor" class="text-emerald-400"/>
                  </svg>
                  <span class="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-emerald-400 ring-2 ring-zinc-900"></span>
                </div>
                <div class="flex flex-col gap-0.5 leading-none flex-1 text-left">
                  <span class="font-semibold text-sm">{workspace.name}</span>
                  <span class="text-xs text-muted-foreground">{workspace.tagline}</span>
                </div>
                <ChevronsUpDown class="ml-auto size-4" />
              </Sidebar.MenuButton>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="right" align="start" class="w-56">
            <DropdownMenu.Label>Workspaces</DropdownMenu.Label>
            <DropdownMenu.Item>{workspace.name}</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>

  <Sidebar.Content>
    <!-- Quick actions (always visible, no group label) -->
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton onclick={() => globalActions.openSearch()} class="text-muted-foreground">
              <Search class="size-4" />
              <span>Search jobs…</span>
              <kbd class="ml-auto text-[10px] font-mono text-muted-foreground/60 px-1 py-0.5 rounded border border-border/50">⌘K</kbd>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton onclick={() => globalActions.openAddJob()}>
              <Plus class="size-4" />
              <span>Add job</span>
              <kbd class="ml-auto text-[10px] font-mono text-muted-foreground/60 px-1 py-0.5 rounded border border-border/50">N</kbd>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    <!-- Inbox / Applications (no group label) -->
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={isActive('/inbox')}>
              {#snippet child({ props })}
                <a href="/inbox" {...props}>
                  <Inbox class="size-4" />
                  <span>Inbox</span>
                  {#if inboxCount > 0}
                    <Badge variant="secondary" class="ml-auto h-5 px-1.5 text-[10px]">{inboxCount}</Badge>
                  {/if}
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={isActive('/applied')}>
              {#snippet child({ props })}
                <a href="/applied" {...props}>
                  <ListTodo class="size-4" />
                  <span>My Applications</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    {#if visiblePins.length > 0}
      <Sidebar.Group class="py-0">
        <CollapsibleGroup label="Pinned" storageKey="pinned" defaultOpen={true}>
          {#snippet icon()}
            <Pin class="size-3 flex-shrink-0" />
          {/snippet}
          {#snippet actions()}
            <DropdownMenu.Root bind:open={pinnedMenuOpen} onOpenChange={onMenuOpenChange}>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button {...props} variant="ghost" size="icon" class="size-5" aria-label="Pinned actions">
                    <MoreHorizontal class="size-3" />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content side="right" align="start" class="w-48">
                <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Pinned ({visiblePins.length})
                </DropdownMenu.Label>
                {@const unpinAllArmed = confirm.isArmed('unpin-all')}
                <DropdownMenu.Item
                  onSelect={(e: Event) => onUnpinAllClick(e)}
                  closeOnSelect={false}
                  class={cn(
                    'gap-2 cursor-pointer transition-colors',
                    unpinAllArmed
                      ? 'bg-red-500/15 text-red-400 focus:bg-red-500/20 focus:text-red-300 animate-pulse'
                      : 'text-red-400 focus:bg-red-500/10 focus:text-red-300'
                  )}
                >
                  <Trash2 class="size-3.5" />
                  <span class="flex-1">{unpinAllArmed ? 'Click again to confirm' : 'Unpin all'}</span>
                  {#if unpinAllArmed}
                    <span class="text-[10px] font-mono opacity-70">3s</span>
                  {/if}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {/snippet}

          <Sidebar.GroupContent>
            <Sidebar.Menu>
              {#each visiblePins as job (job.id)}
                {@const armedThis = confirm.isArmed('unpin:' + job.id)}
                <Sidebar.MenuItem class="group/pin-item relative">
                  <Tooltip.Provider delayDuration={350}>
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props: tipProps })}
                          <Sidebar.MenuButton size="sm" isActive={isActive('/job/' + job.id)} class="text-xs pr-7">
                            {#snippet child({ props })}
                              <a href={'/job/' + job.id} {...props} {...tipProps}>
                                <div class="size-2 rounded-full bg-emerald-500 flex-shrink-0"></div>
                                <span class="truncate">{job.company} · {job.role}</span>
                              </a>
                            {/snippet}
                          </Sidebar.MenuButton>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content side="right" class="text-xs max-w-xs">
                        <div class="font-medium">{job.company}</div>
                        <div class="text-muted-foreground">{job.role}</div>
                      </Tooltip.Content>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                  <Tooltip.Provider delayDuration={300}>
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <button
                            {...props}
                            type="button"
                            onclick={(e) => unpinOne(job.id, e)}
                            aria-label={armedThis ? 'Click again to unpin ' + job.company : 'Unpin ' + job.company}
                            class={cn(
                              'absolute right-1 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded transition-all',
                              armedThis
                                ? 'text-red-300 bg-red-500/15 ring-1 ring-red-500/40 opacity-100 animate-pulse'
                                : 'text-muted-foreground/50 opacity-0 group-hover/pin-item:opacity-100 focus:opacity-100 hover:text-red-300 hover:bg-red-500/10',
                            )}
                          >
                            <Star class="size-3 fill-current" />
                          </button>
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content side="right" class="text-xs">
                        {armedThis ? 'Click again to unpin' : 'Unpin'}
                      </Tooltip.Content>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                </Sidebar.MenuItem>
              {/each}
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        </CollapsibleGroup>
      </Sidebar.Group>
    {/if}

    <Sidebar.Group class="py-0">
      <CollapsibleGroup label="Workspace" storageKey="workspace" defaultOpen={true}>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/pipeline')}>
                {#snippet child({ props })}
                  <a href="/pipeline" {...props}>
                    <KanbanSquare class="size-4" />
                    <span>Pipeline</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/queue')}>
                {#snippet child({ props })}
                  <a href="/queue" {...props}>
                    <ListChecks class="size-4" />
                    <span>Queue</span>
                    {#if queueCount > 0}
                      <Badge variant="secondary" class="ml-auto h-5 px-1.5 text-[10px] border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300">{queueCount}</Badge>
                    {/if}
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/projects')}>
                {#snippet child({ props })}
                  <a href="/projects" {...props}>
                    <FolderKanban class="size-4" />
                    <span>Projects</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/autopilot')}>
                {#snippet child({ props })}
                  <a href="/autopilot" {...props}>
                    <PlayCircle class="size-4" />
                    <span>Autopilot</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/agents')}>
                {#snippet child({ props })}
                  <a href="/agents" {...props}>
                    <Bot class="size-4" />
                    <span>Agents</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/stats')}>
                {#snippet child({ props })}
                  <a href="/stats" {...props}>
                    <BarChart3 class="size-4" />
                    <span>Stats</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/insights')}>
                {#snippet child({ props })}
                  <a href="/insights" {...props}>
                    <Lightbulb class="size-4" />
                    <span>Insights</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </CollapsibleGroup>
    </Sidebar.Group>

    <Sidebar.Group class="py-0">
      <CollapsibleGroup label="Configure" storageKey="configure" defaultOpen={true}>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/profile')}>
                {#snippet child({ props })}
                  <a href="/profile" {...props}>
                    <User class="size-4" />
                    <span>Profile</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/runtimes')}>
                {#snippet child({ props })}
                  <a href="/runtimes" {...props}>
                    <Cpu class="size-4" />
                    <span>Runtimes</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/skills')}>
                {#snippet child({ props })}
                  <a href="/skills" {...props}>
                    <Wrench class="size-4" />
                    <span>Skills</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={isActive('/settings')}>
                {#snippet child({ props })}
                  <a href="/settings" {...props}>
                    <SettingsIcon class="size-4" />
                    <span>Settings</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </CollapsibleGroup>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="sm" isActive={isActive('/help')} class="text-muted-foreground">
          {#snippet child({ props })}
            <a href="/help" {...props}>
              <HelpCircle class="size-4" />
              <span>Help</span>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
</Sidebar.Root>
