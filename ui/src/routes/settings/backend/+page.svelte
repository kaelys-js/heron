<script lang="ts">
  /**
   * /settings/backend -- backend discovery configuration.
   *
   * Two text inputs:
   *   1. Tailscale host -- used as the 4th-in-line discovery candidate.
   *      Pattern: `http://imac.tail-XXXX.ts.net:5173` (the user's Mac's
   *      magic-DNS hostname, with explicit http:// + :port).
   *   2. Production URL -- last-resort fallback when LAN + Tailscale fail.
   *      For users who self-host a public deployment.
   *
   * Both persist to App Group UserDefaults (iOS) AND localStorage so
   * the dashboard rehydrates them at boot for resolveBackend(). The
   * route deliberately uses Capacitor bridge calls instead of /api/*
   * endpoints so an offline-during-discovery user can still configure
   * their backend.
   *
   * Tailscale setup hints + a copy-paste command to discover the Mac's
   * Tailscale URL are inline so a user reaching this page from the
   * "backend unreachable" overlay can self-recover.
   */
  import Topbar from '$lib/components/Topbar.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import {
    setSharedTailscaleUrl,
    setSharedProductionUrl,
    getSharedTailscaleUrl,
    getSharedProductionUrl,
  } from '$lib/client/native-bridge';
  import { resetApiBase, getApiBase, getBackendStatus } from '$lib/client/api-base';
  import { Wifi, Globe, Network, ExternalLink, Copy, CheckCircle2 } from '@lucide/svelte';

  let tailscaleUrl = $state('');
  let productionUrl = $state('');
  let saving = $state(false);
  let loaded = $state(false);
  let probing = $state(false);
  let probeResult = $state<null | { ok: boolean; message: string; source?: string }>(null);

  onMount(async () => {
    const [ts, prod] = await Promise.all([
      getSharedTailscaleUrl().catch(() => null),
      getSharedProductionUrl().catch(() => null),
    ]);
    tailscaleUrl = ts ?? '';
    productionUrl = prod ?? '';
    loaded = true;
  });

  /** Normalise the user's input. They may paste just `imac.tail-xxx.ts.net`
   *  without scheme/port; the resolver needs the full URL with port. */
  function normalize(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // Bare hostname → assume http + dev port. Users who terminate TLS
    // at their Mac (rare) can override by typing the full URL.
    return `http://${trimmed}:5173`;
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      const ts = normalize(tailscaleUrl);
      const prod = normalize(productionUrl);
      tailscaleUrl = ts;
      productionUrl = prod;
      await Promise.all([setSharedTailscaleUrl(ts || null), setSharedProductionUrl(prod || null)]);
      // Force a fresh discovery pass so the new values are tried
      // immediately rather than waiting on the 5-min cache.
      resetApiBase();
      toast.success('Saved. Re-running backend discovery…');
      try {
        const base = await getApiBase();
        const status = getBackendStatus();
        if (status.state === 'resolved') {
          probeResult = {
            ok: true,
            message: `Connected via ${status.source} (${base})`,
            source: status.source,
          };
        }
      } catch (err) {
        probeResult = {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Save failed: ' + msg);
    } finally {
      saving = false;
    }
  }

  async function probeNow() {
    if (probing) return;
    probing = true;
    probeResult = null;
    try {
      resetApiBase();
      const base = await getApiBase();
      const status = getBackendStatus();
      if (status.state === 'resolved') {
        probeResult = {
          ok: true,
          message: `Connected via ${status.source} (${base || 'same-origin'})`,
          source: status.source,
        };
      } else if (status.state === 'error') {
        probeResult = { ok: false, message: status.message };
      } else {
        probeResult = { ok: false, message: 'No backend found' };
      }
    } catch (err) {
      probeResult = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      probing = false;
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${label}`);
    } catch {
      toast.error('Clipboard unavailable');
    }
  }
</script>

<svelte:head>
  <title>Backend · Settings</title>
</svelte:head>

<div class="flex h-full flex-col">
  <Topbar title="Backend" subtitle="LAN / Tailscale / production discovery" />

  <main class="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
    <div class="space-y-2">
      <h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Network class="h-5 w-5" />
        Backend discovery
      </h1>
      <p class="text-sm text-muted-foreground">
        Configure the URLs Heron tries when it can't reach your Mac on the local network. Local
        Bonjour discovery + <code class="font-mono text-xs">localhost:5173</code> always run first; these
        settings only come into play when you're off home wifi.
      </p>
    </div>

    <!-- Tailscale -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-start justify-between gap-3">
          <div>
            <Card.Title class="flex items-center gap-2">
              <Wifi class="h-4 w-4 text-emerald-500" />
              Tailscale
            </Card.Title>
            <Card.Description>
              Your Mac's Tailscale magic-DNS hostname. Used when you're on cellular / a different
              wifi network. Install the Tailscale iOS app and log in to your tailnet first.
            </Card.Description>
          </div>
          <a
            href="https://tailscale.com/download/ios"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            Install Tailscale <ExternalLink class="h-3 w-3" />
          </a>
        </div>
      </Card.Header>
      <Card.Content class="space-y-3">
        <div class="space-y-2">
          <Label for="tailscale-url">Tailscale URL</Label>
          <Input
            id="tailscale-url"
            type="text"
            placeholder="http://imac.tail-abcd1234.ts.net:5173"
            bind:value={tailscaleUrl}
            disabled={!loaded}
          />
          <p class="text-[11px] text-muted-foreground/80">
            Bare hostnames are auto-prefixed with <code class="font-mono">http://</code> and port
            <code class="font-mono">5173</code>. Get yours on the Mac:
            <code class="font-mono">tailscale ip --4</code> (use the IP) or check Tailscale → Devices
            for the magic-DNS name.
          </p>
        </div>
        <div class="rounded-md border border-border/40 bg-muted/30 p-3 text-xs space-y-2">
          <div class="font-medium">Quick setup on the Mac</div>
          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <code class="font-mono text-[11px]">tailscale up &amp;&amp; tailscale ip --4</code>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy"
                onclick={() => copyToClipboard('tailscale up && tailscale ip --4', 'command')}
              >
                <Copy class="h-3.5 w-3.5" />
              </Button>
            </div>
            <p class="text-muted-foreground">
              Copy the IPv4 it prints (e.g. <code class="font-mono">100.100.X.Y</code>). Paste here
              with the dev port: <code class="font-mono">http://100.100.X.Y:5173</code>.
            </p>
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Production -->
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2">
          <Globe class="h-4 w-4 text-amber-500" />
          Production URL (optional)
        </Card.Title>
        <Card.Description>
          Last-resort fallback. Only set this if you've deployed Heron to a public URL (your own
          VPS, Fly.io, Cloudflare Workers, etc.). Skip if you only run on a Mac at home.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="space-y-2">
          <Label for="production-url">Production URL</Label>
          <Input
            id="production-url"
            type="url"
            placeholder="https://heron.example.com"
            bind:value={productionUrl}
            disabled={!loaded}
          />
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Probe result -->
    {#if probeResult}
      <div
        class="flex items-center gap-2 rounded-md border p-3 text-sm {probeResult.ok
          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
          : 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300'}"
      >
        {#if probeResult.ok}
          <CheckCircle2 class="h-4 w-4" />
        {:else}
          <Network class="h-4 w-4" />
        {/if}
        <span>{probeResult.message}</span>
      </div>
    {/if}

    <!-- Save bar -->
    <div
      class="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6"
    >
      <div class="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onclick={probeNow} disabled={probing || !loaded}>
          {probing ? 'Probing…' : 'Test connection'}
        </Button>
        <Button onclick={save} disabled={saving || !loaded}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  </main>
</div>
