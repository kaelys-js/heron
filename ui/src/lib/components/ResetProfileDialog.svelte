<!--
  Nuclear reset dialog — two scopes hidden behind a type-the-word confirmation.
  The button stays disabled until the user types `RESET` exactly. That's
  intentionally awkward: a single misclick should never destroy data.

  Two-level destructiveness:
    * Profile only        — wipes profile.yml + cv.md + _profile.md back to defaults.
                            Tracker / reports / projects ALL kept.
    * Everything          — also wipes pipeline / applications / reports /
                            output / projects / activity feed. The closest
                            thing to a fresh `rm -rf`.

  Backs up every modified file to `<path>.bak` before overwriting. Everything
  except .env / .venv / source code is fair game in 'everything' mode.
-->
<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import {
    AlertTriangle, Trash2, Loader2, Check, FileWarning, Info, ShieldAlert, Flame,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
  import { withMinDuration, cn } from '$lib/utils';

  type Scope = 'profile' | 'everything';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const REQUIRED_PHRASE = 'RESET';
  let typed = $state('');
  let busy = $state(false);
  let scope = $state<Scope>('profile');

  let confirmed = $derived(typed.trim().toUpperCase() === REQUIRED_PHRASE);

  // Wipe local state every time the dialog re-opens so a previously-armed
  // RESET doesn't survive a cancel.
  $effect(() => {
    if (open) {
      typed = '';
      scope = 'profile';
    }
  });

  async function submit() {
    if (!confirmed || busy) return;
    busy = true;
    try {
      const r = await withMinDuration(
        api.post<{ resetFiles: string[]; backups: string[]; scope: Scope }>(
          '/api/profile/reset',
          { confirm: REQUIRED_PHRASE, scope },
          { silent: true },
        ),
        500,
      );
      const headline = scope === 'everything' ? 'Tracker + profile reset' : 'Profile reset';
      toast.success(headline, {
        description:
          r.resetFiles.length + ' file(s) reset · ' +
          r.backups.length + ' backup(s) saved alongside (.bak). ' +
          (scope === 'everything'
            ? 'Pipeline, applications, reports, projects, and activity feed are wiped. Reload to start onboarding.'
            : 'Tracker / reports / projects are still intact. Reload to re-onboard.'),
        duration: 14_000,
      });
      open = false;
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Reset failed', {
        description: err.message + ' — nothing was wiped. Check Settings if a backend dependency is missing.',
        action: { label: 'Retry', onClick: () => submit() },
        duration: 14_000,
      });
    } finally {
      busy = false;
    }
  }

  // Two-mode card config — keeps the JSX simple
  const SCOPES: { value: Scope; label: string; icon: any; sub: string; tone: 'amber' | 'red' }[] = [
    { value: 'profile',     label: 'Profile only',  icon: ShieldAlert, sub: 'profile.yml + cv.md + _profile.md', tone: 'amber' },
    { value: 'everything',  label: 'Everything',    icon: Flame,       sub: 'profile + entire tracker',          tone: 'red' },
  ];
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-xl p-0 gap-0 overflow-hidden border-red-500/30">
    <Dialog.Header class="px-5 pt-5 pb-3 border-b">
      <div class="flex items-start gap-3">
        <div class="size-10 rounded-lg bg-red-500/15 ring-1 ring-red-500/40 flex items-center justify-center flex-shrink-0">
          <ShieldAlert class="size-5 text-red-300" />
        </div>
        <div class="flex-1 min-w-0">
          <Dialog.Title class="text-base text-red-200">Reset to scratch</Dialog.Title>
          <Dialog.Description class="text-xs mt-0.5 leading-relaxed">
            Pick how much to wipe. Both options are destructive and irreversible (apart from <code class="font-mono">.bak</code> backups).
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="px-5 py-4 space-y-3">
      <!-- Scope picker -->
      <div class="grid grid-cols-1 gap-2">
        {#each SCOPES as s}
          {@const active = scope === s.value}
          {@const Icon = s.icon}
          <button
            type="button"
            onclick={() => (scope = s.value)}
            class={cn(
              'flex items-start gap-3 p-3 rounded-md border text-left transition-all',
              active
                ? (s.tone === 'red' ? 'border-red-500/60 bg-red-500/10 ring-1 ring-red-500/40' : 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30')
                : 'border-border/40 bg-card/30 hover:bg-card/50',
            )}
          >
            <div class={cn(
              'size-8 rounded-md flex items-center justify-center flex-shrink-0',
              s.tone === 'red' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300',
            )}>
              <Icon class="size-4" />
            </div>
            <div class="flex-1 min-w-0">
              <div class={cn('text-sm font-semibold', active ? (s.tone === 'red' ? 'text-red-200' : 'text-amber-200') : 'text-foreground')}>
                {s.label}
                {#if active}<span class="ml-2 text-[10px] uppercase tracking-wider opacity-70">selected</span>{/if}
              </div>
              <div class="text-[11px] text-muted-foreground/80 leading-relaxed mt-0.5">
                {s.sub}
              </div>
            </div>
          </button>
        {/each}
      </div>

      <!-- Per-scope detail -->
      {#if scope === 'profile'}
        <div class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div class="flex items-baseline gap-2">
            <FileWarning class="size-3.5 text-amber-300" />
            <span class="text-sm font-medium text-amber-200">Profile only — what happens</span>
          </div>
          <ul class="text-[11px] text-amber-200/85 leading-relaxed space-y-0.5 list-disc list-inside ml-1">
            <li><code class="font-mono">config/profile.yml</code> → restored from the example template</li>
            <li><code class="font-mono">cv.md</code> → deleted (use CV manager → Replace to add one)</li>
            <li><code class="font-mono">modes/_profile.md</code> → restored from the system template</li>
          </ul>
          <div class="rounded border border-emerald-500/30 bg-emerald-500/5 p-2 mt-2 flex items-start gap-2">
            <Check class="size-3 text-emerald-300 mt-0.5 flex-shrink-0" />
            <p class="text-[10px] text-emerald-200/85 leading-relaxed">
              Kept: applications.md, pipeline.md, projects, reports/, output/, activity feed, .env / API keys.
            </p>
          </div>
        </div>
      {:else}
        <div class="rounded-md border border-red-500/40 bg-red-500/10 p-3 space-y-2">
          <div class="flex items-baseline gap-2">
            <Flame class="size-3.5 text-red-300" />
            <span class="text-sm font-medium text-red-200">Everything — what happens</span>
          </div>
          <p class="text-[11px] text-red-200/85 leading-relaxed">
            All of "Profile only", PLUS the entire job-search tracker:
          </p>
          <ul class="text-[11px] text-red-200/85 leading-relaxed space-y-0.5 list-disc list-inside ml-1">
            <li><code class="font-mono">data/applications.md</code> → header-only · every applied job lost</li>
            <li><code class="font-mono">data/pipeline.md</code> → emptied · every queued URL lost</li>
            <li><code class="font-mono">data/scan-history.tsv</code>, <code class="font-mono">gemini-scores.tsv</code> → deleted</li>
            <li><code class="font-mono">data/projects.json</code>, <code class="font-mono">autopilot.json</code> → deleted</li>
            <li><code class="font-mono">data/activity.jsonl</code> → cleared (bell empties)</li>
            <li><code class="font-mono">reports/*</code> + <code class="font-mono">output/*</code> → every deep eval and tailored CV PDF deleted</li>
          </ul>
          <div class="rounded border border-emerald-500/30 bg-emerald-500/5 p-2 mt-2 flex items-start gap-2">
            <Check class="size-3 text-emerald-300 mt-0.5 flex-shrink-0" />
            <p class="text-[10px] text-emerald-200/85 leading-relaxed">
              Kept: <code class="font-mono">.env</code> (API keys), Python <code class="font-mono">.venv</code>, source code.
              Existing <code class="font-mono">.bak</code> files from previous resets are also preserved.
            </p>
          </div>
        </div>
      {/if}

      <!-- Backups -->
      <div class="rounded-md border border-border/40 bg-muted/30 p-3 flex items-start gap-2">
        <Info class="size-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
        <p class="text-[11px] text-muted-foreground/90 leading-relaxed">
          Every modified file gets backed up to <code class="font-mono">&lt;path&gt;.bak</code> first. If you change your mind,
          restore by hand. <strong>Reports + output PDFs are deleted outright in "Everything" mode</strong> — no backup of those.
        </p>
      </div>

      <!-- Type-to-confirm input -->
      <div class="pt-2 space-y-1.5">
        <Label class="text-xs flex items-center gap-1.5">
          <AlertTriangle class="size-3 text-red-300" />
          Type <span class="font-mono text-red-300 font-semibold">{REQUIRED_PHRASE}</span> to enable the reset button
        </Label>
        <Input
          bind:value={typed}
          placeholder={REQUIRED_PHRASE}
          class="h-9 text-sm font-mono uppercase tracking-wider"
          autocomplete="off"
          autocapitalize="characters"
        />
      </div>
    </div>

    <Dialog.Footer class="px-5 py-3 border-t bg-muted/20">
      <Button variant="ghost" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
      <Button
        variant="default"
        onclick={submit}
        disabled={!confirmed || busy}
        class={cn(
          'gap-1.5 text-white',
          scope === 'everything'
            ? 'bg-red-500/90 hover:bg-red-500 disabled:bg-red-500/30 disabled:text-red-200/50'
            : 'bg-amber-500/80 hover:bg-amber-500 disabled:bg-amber-500/30 disabled:text-amber-200/50 text-amber-50',
        )}
      >
        {#if busy}
          <Loader2 class="size-3.5 animate-spin" /> Resetting…
        {:else if scope === 'everything'}
          <Flame class="size-3.5" /> Wipe everything
        {:else}
          <Trash2 class="size-3.5" /> Reset profile
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
