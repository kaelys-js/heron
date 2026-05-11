<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import {
    Users, Plus, Check, Trash2, Edit2, Loader2, Briefcase, ArrowRight,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { cn, formatRelativeTime } from '$lib/utils';
  import type { ProfileColor, ProfilesState, Profile } from '$lib/server/profiles';

  // Inline the color list so we don't pull anything else from $lib/server.
  const PROFILE_COLORS: ProfileColor[] = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'orange', 'pink'];

  let { data }: {
    data: {
      state: ProfilesState;
      stats: Record<string, { totalJobs: number; applied: number; reports: number }>;
    };
  } = $props();

  let busy = $state<Record<string, 'activate' | 'rename' | 'delete' | null>>({});
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let confirmDeleteId = $state<string | null>(null);
  let confirmDeleteTyped = $state('');

  function dot(color: string): string {
    const map: Record<string, string> = {
      blue: 'bg-blue-400', emerald: 'bg-emerald-400', violet: 'bg-violet-400',
      amber: 'bg-amber-400', rose: 'bg-rose-400', cyan: 'bg-cyan-400',
      orange: 'bg-orange-400', pink: 'bg-pink-400',
    };
    return map[color] ?? 'bg-zinc-400';
  }
  function tintBorder(color: string): string {
    const map: Record<string, string> = {
      blue: 'border-blue-500/30', emerald: 'border-emerald-500/30', violet: 'border-violet-500/30',
      amber: 'border-amber-500/30', rose: 'border-rose-500/30', cyan: 'border-cyan-500/30',
      orange: 'border-orange-500/30', pink: 'border-pink-500/30',
    };
    return map[color] ?? 'border-border/40';
  }

  async function makeActive(p: Profile) {
    if (busy[p.id]) return;
    busy = { ...busy, [p.id]: 'activate' };
    try {
      await api.post('/api/profiles/active', { id: p.id }, { silent: true });
      toast.success('Active: ' + p.name);
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Switch failed', { description: err.message });
    } finally {
      busy = { ...busy, [p.id]: null };
    }
  }

  function startRename(p: Profile) {
    editingId = p.id;
    editName = p.name;
  }

  async function commitRename(p: Profile) {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === p.name) { editingId = null; return; }
    busy = { ...busy, [p.id]: 'rename' };
    try {
      const r = await fetch('/api/profiles/' + encodeURIComponent(p.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!r.ok) {
        const json = await r.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? 'rename failed');
      }
      toast.success('Renamed to ' + trimmed);
      editingId = null;
      await invalidateAll();
    } catch (e) {
      toast.error('Rename failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      busy = { ...busy, [p.id]: null };
    }
  }

  async function recolor(p: Profile, color: ProfileColor) {
    try {
      await fetch('/api/profiles/' + encodeURIComponent(p.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color }),
      });
      await invalidateAll();
    } catch (e) {
      toast.error('Recolor failed', { description: e instanceof Error ? e.message : String(e) });
    }
  }

  async function commitDelete(p: Profile) {
    if (confirmDeleteTyped !== 'DELETE') return;
    busy = { ...busy, [p.id]: 'delete' };
    try {
      const r = await fetch('/api/profiles/' + encodeURIComponent(p.id), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!r.ok) {
        const json = await r.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? 'delete failed');
      }
      toast.success('Profile deleted', { description: p.name });
      confirmDeleteId = null;
      confirmDeleteTyped = '';
      await invalidateAll();
    } catch (e) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      busy = { ...busy, [p.id]: null };
    }
  }
</script>

<div class="h-full overflow-y-auto">
  <Topbar title="Profiles" subtitle="Manage your career tracks" showTabs={false} />

  <div class="p-6 pb-24">
    <div class="max-w-3xl mx-auto space-y-5">

      <!-- Hero -->
      <div class="space-y-1.5 max-w-2xl">
        <h1 class="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Users class="size-5 text-fuchsia-400" />
          Profiles
        </h1>
        <p class="text-sm text-muted-foreground leading-relaxed">
          Each profile is a distinct career track with its own CV, target roles, filters,
          pipeline, and applications tracker. Shared infrastructure (API keys, LinkedIn /
          Indeed sessions, Gmail IMAP, autopilot schedule) is reused across every profile.
        </p>
      </div>

      <!-- Add profile -->
      <div class="flex justify-end">
        <Button onclick={() => goto('/onboarding?new=1')} class="gap-1.5">
          <Plus class="size-4" /> Add new profile
        </Button>
      </div>

      <!-- Profile cards -->
      <div class="space-y-3">
        {#each data.state.profiles as p (p.id)}
          {@const isActive = p.id === data.state.activeId}
          {@const s = data.stats[p.id]}
          {@const b = busy[p.id]}
          <Card.Root class={cn('transition-colors', tintBorder(p.color), isActive && 'ring-1 ring-emerald-500/40')}>
            <Card.Content class="px-4 py-3">
              <div class="flex items-start gap-3">
                <span class={cn('size-3 rounded-full mt-1.5 flex-shrink-0', dot(p.color))}></span>
                <div class="flex-1 min-w-0">
                  {#if editingId === p.id}
                    <div class="flex items-center gap-2 mb-1">
                      <Input bind:value={editName} class="h-7 text-sm" autofocus onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') commitRename(p); if (e.key === 'Escape') editingId = null; }} />
                      <Button size="sm" class="h-7 text-xs" onclick={() => commitRename(p)} disabled={b === 'rename'}>
                        {#if b === 'rename'}<Loader2 class="size-3 animate-spin" />{:else}Save{/if}
                      </Button>
                      <Button size="sm" variant="ghost" class="h-7 text-xs" onclick={() => (editingId = null)}>Cancel</Button>
                    </div>
                  {:else}
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="text-sm font-semibold">{p.name}</h3>
                      <code class="text-[10px] font-mono text-muted-foreground/70">{p.id}</code>
                      {#if isActive}
                        <Badge variant="outline" class="text-[10px] h-4 px-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                          <Check class="size-2.5 mr-0.5" /> active
                        </Badge>
                      {/if}
                    </div>
                  {/if}
                  <div class="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                    {#if s}
                      <span><Briefcase class="inline size-2.5 mr-0.5" />{s.totalJobs} jobs</span>
                      <span>· {s.applied} applied</span>
                      <span>· {s.reports} reports</span>
                    {/if}
                    {#if p.lastActiveAt}
                      <span class="text-muted-foreground/60">· last active {formatRelativeTime(p.lastActiveAt)} ago</span>
                    {/if}
                  </div>

                  <!-- Color picker -->
                  <div class="flex items-center gap-1 mt-2">
                    {#each PROFILE_COLORS as c (c)}
                      <button
                        type="button"
                        onclick={() => recolor(p, c)}
                        class={cn(
                          'size-4 rounded-full transition-transform hover:scale-110',
                          dot(c),
                          c === p.color && 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-background',
                        )}
                        aria-label={'Color ' + c}
                      ></button>
                    {/each}
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex flex-col gap-1.5 flex-shrink-0">
                  {#if !isActive}
                    <Button variant="outline" size="sm" class="h-7 text-xs gap-1" onclick={() => makeActive(p)} disabled={b !== null && b !== undefined}>
                      {#if b === 'activate'}<Loader2 class="size-3 animate-spin" />{:else}<ArrowRight class="size-3" /> Activate{/if}
                    </Button>
                  {/if}
                  <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" onclick={() => startRename(p)} disabled={editingId === p.id}>
                    <Edit2 class="size-3" /> Rename
                  </Button>
                  {#if data.state.profiles.length > 1}
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-7 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onclick={() => { confirmDeleteId = p.id; confirmDeleteTyped = ''; }}
                    >
                      <Trash2 class="size-3" /> Delete…
                    </Button>
                  {/if}
                </div>
              </div>

              {#if confirmDeleteId === p.id}
                <div class="mt-3 p-3 rounded-md border border-red-500/30 bg-red-500/5 space-y-2">
                  <p class="text-[11px] text-red-200/90 leading-relaxed">
                    Deleting <strong>{p.name}</strong> removes its entire <code class="font-mono">data/profiles/{p.id}/</code>
                    directory — every job, every report, every PDF. Shared infrastructure
                    (.env, sessions, autopilot) is preserved.
                  </p>
                  <div class="flex items-center gap-2">
                    <Label class="text-[10px]">Type DELETE to confirm:</Label>
                    <Input bind:value={confirmDeleteTyped} class="h-7 text-xs font-mono w-32" placeholder="DELETE" autocomplete="off" />
                    <Button
                      size="sm"
                      class="h-7 text-xs gap-1 bg-red-500/90 hover:bg-red-500"
                      onclick={() => commitDelete(p)}
                      disabled={confirmDeleteTyped !== 'DELETE' || b === 'delete'}
                    >
                      {#if b === 'delete'}<Loader2 class="size-3 animate-spin" />{:else}<Trash2 class="size-3" /> Delete{/if}
                    </Button>
                    <Button size="sm" variant="ghost" class="h-7 text-xs" onclick={() => { confirmDeleteId = null; confirmDeleteTyped = ''; }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        {/each}
      </div>
    </div>
  </div>
</div>
