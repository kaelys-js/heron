<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    ChevronDown, ExternalLink, Plus, Check, Sparkles, Globe, Send, ListTodo,
    AlertCircle, Lightbulb, ArrowRight, Briefcase,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/api';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { cn, withMinDuration } from '$lib/utils';
  import { globalActions } from '$lib/global-actions.svelte';
  import { STATUS_ORDER, type Status } from '$lib/types';
  import CheckMark from './CheckMark.svelte';
  import { cmd } from '$lib/config/branding';

  let url = $state('');
  let company = $state('');
  let role = $state('');
  let status = $state<Status>('Scored');
  let busy = $state(false);

  // Reset on close
  $effect(() => {
    if (!globalActions.addJobOpen) {
      url = '';
      company = '';
      role = '';
      status = 'Scored';
      busy = false;
    }
  });

  // Press "N" anywhere to open
  onMount(() => {
    if (typeof window === 'undefined') return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        globalActions.openAddJob();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  let canSubmit = $derived(url.trim().length > 0 && !busy);

  // ---- URL auto-detection ----
  type Detected = { source: string; company?: string };
  let detected = $derived.by<Detected | null>(() => {
    const u = url.trim();
    if (!u) return null;
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.replace(/^www\./, '');
      const pathSegs = parsed.pathname.split('/').filter(Boolean);

      if (host.includes('greenhouse.io')) {
        return { source: 'Greenhouse', company: titleCase(pathSegs[0]) };
      }
      if (host.includes('ashbyhq.com')) {
        return { source: 'Ashby', company: titleCase(pathSegs[0]) };
      }
      if (host.includes('lever.co')) {
        return { source: 'Lever', company: titleCase(pathSegs[0]) };
      }
      if (host.includes('linkedin.com')) {
        return { source: 'LinkedIn (Easy Apply available)' };
      }
      if (host.includes('indeed.com')) {
        return { source: 'Indeed' };
      }
      if (host.includes('glassdoor.com')) {
        return { source: 'Glassdoor' };
      }
      if (host.includes('remoteok.com')) {
        return { source: 'RemoteOK' };
      }
      if (host.includes('workatastartup') || host.includes('ycombinator')) {
        return { source: 'YC Work at a Startup' };
      }
      if (host.includes('weworkremotely')) {
        return { source: 'We Work Remotely' };
      }
      // Fallback: use the second-level domain as the source
      const fallback = host.split('.').slice(-2, -1)[0];
      return { source: fallback ? titleCase(fallback) : host };
    } catch {
      return null;
    }
  });

  function titleCase(s?: string): string {
    if (!s) return '';
    return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Auto-fill company from detection on URL paste/change
  $effect(() => {
    const d = detected;
    if (d?.company && !company) company = d.company;
  });

  async function submit() {
    if (!canSubmit) return;
    busy = true;
    try {
      const trimmedUrl = url.trim();
      const trimmedCompany = company.trim();
      const trimmedRole = role.trim();
      await withMinDuration(
        api.post('/api/status', {
          url: trimmedUrl,
          newStatus: status,
          notes: trimmedCompany && trimmedRole ? trimmedCompany + ' · ' + trimmedRole : '',
        }, { silent: true }),
        500,
      );
      toast.success('Added to ' + status, {
        description: trimmedCompany || trimmedUrl,
      });
      globalActions.closeAddJob();
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Failed to add', { description: err.message });
    } finally {
      busy = false;
    }
  }

  // ---- Status definitions for the visual picker ----
  type StatusDef = { value: Status; label: string; desc: string; icon: any; tint: string };
  const STATUS_DEFS: StatusDef[] = [
    { value: 'New',       label: 'New',       desc: 'Just discovered — no score yet',                 icon: Sparkles, tint: 'text-zinc-400' },
    { value: 'Scored',    label: 'Scored',    desc: 'Default — review and promote to Ready or Apply', icon: Globe,    tint: 'text-cyan-400' },
    { value: 'Ready',     label: 'Ready',     desc: 'Eval done · CV PDF ready · go apply',            icon: ListTodo, tint: 'text-emerald-400' },
    { value: 'Applied',   label: 'Applied',   desc: 'You already submitted — track follow-ups',       icon: Send,     tint: 'text-violet-400' },
    { value: 'Interview', label: 'Interview', desc: 'In active interview process',                    icon: Briefcase, tint: 'text-orange-400' },
    { value: 'Closed',    label: 'Closed',    desc: 'Skip — not pursuing',                            icon: AlertCircle, tint: 'text-zinc-500' },
  ];
  let activeStatusDef = $derived(STATUS_DEFS.find((s) => s.value === status) ?? STATUS_DEFS[1]);
</script>

<Dialog.Root open={globalActions.addJobOpen} onOpenChange={(v: boolean) => (globalActions.addJobOpen = v)}>
  <Dialog.Content class="sm:max-w-lg p-0 gap-0 overflow-hidden">
    <Dialog.Header class="px-5 pt-5 pb-3 border-b">
      <div class="flex items-start gap-3">
        <div class="size-9 rounded-lg bg-foreground/5 ring-1 ring-border flex items-center justify-center flex-shrink-0">
          <Plus class="size-4 text-foreground" />
        </div>
        <div class="flex-1 min-w-0">
          <Dialog.Title class="text-base">Add a job</Dialog.Title>
          <Dialog.Description class="text-xs mt-0.5">
            Track any posting — LinkedIn, Greenhouse, Ashby, or anywhere with a URL.
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="px-5 py-4 space-y-4">
      <!-- URL with detection -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <Label class="text-xs flex items-center gap-1.5">
            Job URL <span class="text-red-400">*</span>
          </Label>
          {#if url.trim()}
            <a href={url} target="_blank" rel="noopener" class="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              Open <ExternalLink class="size-2.5" />
            </a>
          {/if}
        </div>
        <Input
          type="url"
          bind:value={url}
          placeholder="https://boards.greenhouse.io/vercel/jobs/123…"
          class="font-mono text-sm h-9"
        />
        {#if detected}
          <div class="flex items-center gap-1.5 text-[11px] text-emerald-300/90 animate-in fade-in slide-in-from-top-1 duration-200">
            <Check class="size-3 flex-shrink-0" />
            <span>Detected:</span>
            <span class="font-medium">{detected.source}</span>
            {#if detected.company}
              <span class="text-muted-foreground">·</span>
              <span class="font-medium">{detected.company}</span>
            {/if}
          </div>
        {:else if !url.trim()}
          <p class="text-[10px] text-muted-foreground/70">
            Paste a URL — we'll auto-detect the source and pre-fill the company name.
          </p>
        {/if}
      </div>

      <!-- Role + Company -->
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label class="text-xs">Role title</Label>
          <Input bind:value={role} placeholder="Senior Backend Engineer" class="h-9 text-sm" />
          <p class="text-[10px] text-muted-foreground/70">Shown on cards and in your tracker.</p>
        </div>
        <div class="space-y-1.5">
          <Label class="text-xs">Company</Label>
          <Input bind:value={company} placeholder="Acme" class="h-9 text-sm" />
          <p class="text-[10px] text-muted-foreground/70">Auto-filled when we recognize the URL.</p>
        </div>
      </div>

      <!-- Status with rich descriptions -->
      <div class="space-y-1.5">
        <Label class="text-xs">Initial status</Label>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              {@const Icon = activeStatusDef.icon}
              <Button
                {...props}
                variant="outline"
                class="w-full h-9 justify-between text-sm font-normal"
              >
                <span class="flex items-center gap-2 min-w-0">
                  <Icon class={cn('size-3.5 flex-shrink-0', activeStatusDef.tint)} />
                  <span class="font-medium">{activeStatusDef.label}</span>
                  <span class="text-muted-foreground/70 text-xs truncate">— {activeStatusDef.desc}</span>
                </span>
                <ChevronDown class="size-3.5 text-muted-foreground flex-shrink-0" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-[var(--bits-dropdown-menu-anchor-width)] max-h-72 overflow-y-auto">
            {#each STATUS_DEFS as s}
              {@const Icon = s.icon}
              <DropdownMenu.Item
                onSelect={() => (status = s.value)}
                closeOnSelect={false}
                class="gap-2 items-start py-1.5"
              >
                <Icon class={cn('size-3.5 mt-0.5 flex-shrink-0', s.tint)} />
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium">{s.label}</div>
                  <div class="text-[10px] text-muted-foreground/70 leading-tight">{s.desc}</div>
                </div>
                <CheckMark active={status === s.value} class="mt-0.5" />
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <p class="text-[10px] text-muted-foreground/70">Most jobs start in <span class="font-mono text-foreground">Scored</span> so you can triage them; switch to <span class="font-mono text-foreground">Applied</span> if you've already submitted.</p>
      </div>

      <!-- Workflow next-steps -->
      <div class="rounded-md border border-border/40 bg-muted/30 px-3 py-2.5">
        <div class="flex items-start gap-2">
          <Lightbulb class="size-3.5 text-amber-400/90 mt-0.5 flex-shrink-0" />
          <div class="space-y-1 min-w-0">
            <div class="text-[11px] font-medium">What happens next</div>
            <p class="text-[10px] text-muted-foreground/80 leading-relaxed">
              The job lands in your pipeline. From the job detail page you can run a deep evaluation
              (<code class="font-mono text-foreground/80">{cmd('oferta')}</code>), generate a tailored CV PDF, and apply
              — manually, via LinkedIn Easy Apply, or via Open &amp; Mark Applied.
            </p>
          </div>
        </div>
      </div>
    </div>

    <Dialog.Footer class="px-5 py-3 border-t bg-muted/20">
      <Button variant="ghost" onclick={() => globalActions.closeAddJob()} disabled={busy}>Cancel</Button>
      <Button onclick={submit} disabled={!canSubmit} class="gap-1.5">
        {#if busy}
          Adding…
        {:else}
          Add to <span class="font-medium">{status}</span>
          <ArrowRight class="size-3.5" />
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
