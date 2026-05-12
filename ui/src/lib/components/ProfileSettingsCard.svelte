<!--
  ProfileSettingsCard — avatar / displayName / appearance / theme / notifications.

  Per-machine settings (not per-profile — those live elsewhere). When
  multi-user support lands these become per-user. Storage is data/ui-prefs.json.

  Appearance toggle drives `<html class="dark|light|...">` via an effect
  that runs on every prefs load. Theme similarly drives a `data-theme`
  attribute consumed by CSS variables.

  Notifications section has separate toggles for OS-level (via
  PushNotificationsToggle.svelte) and in-app toasts. The combined
  view here.
-->
<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    User, Sun, Moon, Monitor, Palette, Bell, BellOff, Upload, Trash2,
    Loader2, CheckCircle2, AlertCircle,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { onMount } from 'svelte';
  import { cn } from '$lib/utils';

  type Appearance = 'system' | 'light' | 'dark';
  type Theme = 'default' | 'fuchsia' | 'emerald' | 'amber' | 'blue' | 'rose';

  type Notifications = {
    os: { error: boolean; warn: boolean; success: boolean; info: boolean };
    toast: { error: boolean; warn: boolean; success: boolean; info: boolean };
    mutedSources: string[];
  };

  type UiPrefs = {
    displayName?: string;
    avatarPath?: string;
    appearance: Appearance;
    theme: Theme;
    notifications: Notifications;
  };

  let prefs = $state<UiPrefs>({
    appearance: 'system',
    theme: 'default',
    notifications: {
      os: { error: true, warn: true, success: true, info: false },
      toast: { error: true, warn: true, success: true, info: true },
      mutedSources: [],
    },
  });

  let loading = $state(true);
  let savingDisplayName = $state(false);
  let uploadingAvatar = $state(false);
  let displayNameDraft = $state('');
  // Cache-bust avatar URL when re-uploaded.
  let avatarVersion = $state(0);
  let fileInput = $state<HTMLInputElement | null>(null);

  onMount(async () => {
    try {
      const r = await api.get<UiPrefs>('/api/ui-prefs', { silent: true });
      prefs = r;
      displayNameDraft = r.displayName ?? '';
      applyAppearance(r.appearance);
      applyTheme(r.theme);
    } catch (e) {
      // Defaults are fine; nothing to surface.
      void e;
    } finally {
      loading = false;
    }
  });

  /** Apply appearance to the document. Re-fires whenever the toggle changes
   *  so it's live without a page reload. */
  function applyAppearance(a: Appearance) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (a === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
      root.classList.toggle('light', !prefersDark);
    } else {
      root.classList.toggle('dark', a === 'dark');
      root.classList.toggle('light', a === 'light');
    }
  }
  function applyTheme(t: Theme) {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', t);
  }

  async function patchPrefs(patch: Partial<UiPrefs>) {
    try {
      // The shared api helper doesn't have PATCH; fetch directly.
      const r = await fetch('/api/ui-prefs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error('PATCH failed: ' + r.status);
      const next = await r.json() as UiPrefs;
      prefs = next;
      if (patch.appearance) applyAppearance(next.appearance);
      if (patch.theme) applyTheme(next.theme);
    } catch (e) {
      const err = e as ApiError;
      toast.error('Save failed', { description: err.message });
    }
  }

  async function saveDisplayName() {
    if (savingDisplayName) return;
    savingDisplayName = true;
    try {
      await patchPrefs({ displayName: displayNameDraft.trim() || undefined });
      toast.success('Display name saved');
    } finally {
      savingDisplayName = false;
    }
  }

  async function uploadAvatar(file: File) {
    if (uploadingAvatar) return;
    uploadingAvatar = true;
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const r = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error('Upload failed', { description: (j as { error?: string }).error ?? 'unknown' });
        return;
      }
      const j = await r.json() as { ok: boolean; path?: string };
      if (j.ok) {
        // Reload prefs to pick up the new avatarPath.
        const next = await api.get<UiPrefs>('/api/ui-prefs', { silent: true });
        prefs = next;
        avatarVersion = Date.now();
        toast.success('Avatar uploaded');
      }
    } catch (e) {
      toast.error('Upload failed', { description: (e as Error).message });
    } finally {
      uploadingAvatar = false;
    }
  }

  async function removeAvatar() {
    try {
      await api.delete('/api/profile/avatar', { silent: true });
      const next = await api.get<UiPrefs>('/api/ui-prefs', { silent: true });
      prefs = next;
      avatarVersion = Date.now();
      toast.success('Avatar removed');
    } catch (e) {
      toast.error('Remove failed', { description: (e as Error).message });
    }
  }

  function avatarSrc(): string {
    return '/api/profile/avatar?v=' + avatarVersion;
  }

  function initials(name?: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  const THEME_TINTS: Record<Theme, string> = {
    default: 'bg-slate-500',
    fuchsia: 'bg-fuchsia-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    blue: 'bg-blue-500',
    rose: 'bg-rose-500',
  };
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-base flex items-center gap-2">
      <User class="size-4 text-fuchsia-400" />
      Profile + appearance
    </Card.Title>
    <Card.Description>
      Per-machine settings — your display name, avatar, theme, and which event types
      ping you. Multi-user support comes later; for now these apply to this install.
    </Card.Description>
  </Card.Header>
  <Card.Content class="space-y-5">
    {#if loading}
      <div class="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 class="size-3.5 animate-spin" /> Loading…
      </div>
    {:else}
      <!-- Avatar + display name -->
      <div class="flex items-center gap-4">
        <div class="relative">
          {#if prefs.avatarPath}
            <img src={avatarSrc()} alt="avatar" class="size-16 rounded-full object-cover border border-border/40" />
          {:else}
            <div class="size-16 rounded-full bg-fuchsia-500/10 ring-1 ring-fuchsia-500/40 flex items-center justify-center text-xl font-medium text-fuchsia-200">
              {initials(prefs.displayName)}
            </div>
          {/if}
          {#if uploadingAvatar}
            <div class="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
              <Loader2 class="size-5 animate-spin text-white" />
            </div>
          {/if}
        </div>
        <div class="flex-1 space-y-1.5">
          <Label class="text-xs" for="display-name">Display name</Label>
          <div class="flex items-center gap-2">
            <Input
              id="display-name"
              type="text"
              bind:value={displayNameDraft}
              placeholder="e.g. Cole"
              class="h-9 text-sm flex-1"
            />
            <Button size="sm" onclick={saveDisplayName} disabled={savingDisplayName}>
              {#if savingDisplayName}<Loader2 class="size-3 animate-spin" />{:else}Save{/if}
            </Button>
          </div>
          <div class="flex items-center gap-2 pt-1">
            <input
              bind:this={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              class="hidden"
              onchange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                if (f) uploadAvatar(f);
              }}
            />
            <Button size="sm" variant="outline" onclick={() => fileInput?.click()} class="gap-1.5 h-7 text-[11px]">
              <Upload class="size-3" /> Upload avatar
            </Button>
            {#if prefs.avatarPath}
              <Button size="sm" variant="ghost" onclick={removeAvatar} class="gap-1.5 h-7 text-[11px] text-muted-foreground hover:text-red-300">
                <Trash2 class="size-3" /> Remove
              </Button>
            {/if}
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div class="space-y-2 pt-2 border-t border-border/30">
        <Label class="text-xs">Appearance</Label>
        <div class="grid grid-cols-3 gap-1.5">
          {#each [
            { id: 'system' as const, label: 'System', icon: Monitor },
            { id: 'light' as const, label: 'Light', icon: Sun },
            { id: 'dark' as const, label: 'Dark', icon: Moon },
          ] as opt}
            <button
              type="button"
              onclick={() => patchPrefs({ appearance: opt.id })}
              class={cn(
                'rounded-md border px-3 py-2 flex items-center justify-center gap-1.5 text-xs transition',
                prefs.appearance === opt.id
                  ? 'border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-100'
                  : 'border-border/40 bg-card hover:border-border',
              )}
            >
              <opt.icon class="size-3.5" />
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Theme -->
      <div class="space-y-2 pt-2 border-t border-border/30">
        <Label class="text-xs">Accent theme</Label>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {#each Object.entries(THEME_TINTS) as [theme, tint]}
            <button
              type="button"
              onclick={() => patchPrefs({ theme: theme as Theme })}
              class={cn(
                'rounded-md border p-2 flex flex-col items-center gap-1 text-[10px] transition',
                prefs.theme === theme
                  ? 'border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-100'
                  : 'border-border/40 bg-card hover:border-border text-muted-foreground',
              )}
            >
              <span class={cn('size-5 rounded-full', tint)}></span>
              <span class="font-mono lowercase">{theme}</span>
            </button>
          {/each}
        </div>
        <p class="text-[10px] text-muted-foreground/70">
          Drives <code class="font-mono">data-theme</code> attribute on the document. CSS variables key off it.
        </p>
      </div>

      <!-- Notifications -->
      <div class="space-y-2 pt-2 border-t border-border/30">
        <Label class="text-xs flex items-center gap-1.5">
          <Bell class="size-3 text-amber-400" /> In-app notifications (toasts)
        </Label>
        <div class="grid grid-cols-2 gap-1.5">
          {#each [
            { level: 'error' as const, label: 'Errors', tint: 'text-red-300' },
            { level: 'warn' as const, label: 'Warnings', tint: 'text-amber-300' },
            { level: 'success' as const, label: 'Successes', tint: 'text-emerald-300' },
            { level: 'info' as const, label: 'Info', tint: 'text-blue-300' },
          ] as opt}
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.notifications.toast[opt.level]}
                onchange={(e) => patchPrefs({
                  notifications: {
                    ...prefs.notifications,
                    toast: { ...prefs.notifications.toast, [opt.level]: (e.currentTarget as HTMLInputElement).checked },
                  },
                })}
                class="size-3.5 rounded border-border accent-foreground"
              />
              <span class={opt.tint}>{opt.label}</span>
            </label>
          {/each}
        </div>
        <p class="text-[10px] text-muted-foreground/70 pt-1">
          OS-level notifications (when the dashboard tab is in the background) are handled separately
          in the "Notifications" card above — they require browser permission.
        </p>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
