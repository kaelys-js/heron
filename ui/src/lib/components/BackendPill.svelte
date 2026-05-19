<!--
  BackendPill — DEV / PROD / LAN / TAILSCALE / REMOTE indicator.

  Shown in the topbar next to the profile switcher. Renders a small
  colored pill with the current backend source (set by backend-discovery
  resolver). Click → /settings/backend with manual override controls.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    resolveBackend,
    pillLabel,
    type BackendSource,
    type ResolvedBackend,
  } from '$lib/client/backend-discovery';
  import { Capacitor } from '@capacitor/core';

  let resolved: ResolvedBackend | null = $state(null);
  let isCapacitor = $derived(typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform());

  // Color per source -- green when local, amber when LAN, blue when remote.
  const colorBySource: Record<BackendSource, string> = {
    embedded: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
    dev: 'bg-violet-500/20 text-violet-200 border-violet-500/40',
    lan: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
    tailscale: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
    remote: 'bg-slate-500/20 text-slate-200 border-slate-500/40',
    manual: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
  };

  onMount(async () => {
    try {
      resolved = await resolveBackend({
        embeddedUrl: (globalThis as any).__HERON__?.embeddedUrl,
        // tailscaleHost/productionUrl pulled from user prefs by the settings page
      });
    } catch {
      resolved = null;
    }
  });

  function describe(r: ResolvedBackend): string {
    if (r.source === 'dev') return 'Vite dev server';
    if (r.source === 'embedded') return 'Embedded production server';
    if (r.source === 'lan') return 'Desktop app on LAN';
    if (r.source === 'tailscale') return 'Tailscale tunnel';
    if (r.source === 'remote') return 'Remote production';
    if (r.source === 'manual') return 'Manual override';
    return r.url;
  }
</script>

{#if resolved}
  <a
    href="/settings/backend"
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide transition-colors {colorBySource[
      resolved.source
    ]}"
    title="{describe(resolved)} · {resolved.url}"
  >
    <span class="size-1.5 rounded-full bg-current opacity-80"></span>
    {pillLabel(resolved.source)}
  </a>
{:else if isCapacitor}
  <span
    class="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide text-rose-200"
  >
    OFFLINE
  </span>
{/if}
