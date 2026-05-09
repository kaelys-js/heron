<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Target, ArrowRight, ArrowLeft, Loader2, Plus, X } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';

  let { data }: {
    data: {
      initial: {
        target_roles: string[];
        positive: string[];
        negative: string[];
        target_range: string;
        currency: string;
        minimum: string;
        must_have: string[];
        strong_plus: string[];
        hard_no: string[];
      };
      bootstrappedFromTemplate: boolean;
    };
  } = $props();

  // Each chip-list owns its own draft input + array. Local state, never cross-bound.
  // svelte-ignore state_referenced_locally — initial seed only
  let targetRoles = $state([...data.initial.target_roles]);
  // svelte-ignore state_referenced_locally — initial seed only
  let positive = $state([...data.initial.positive]);
  // svelte-ignore state_referenced_locally — initial seed only
  let negative = $state([...data.initial.negative]);
  // svelte-ignore state_referenced_locally — initial seed only
  let mustHave = $state([...data.initial.must_have]);
  // svelte-ignore state_referenced_locally — initial seed only
  let strongPlus = $state([...data.initial.strong_plus]);
  // svelte-ignore state_referenced_locally — initial seed only
  let hardNo = $state([...data.initial.hard_no]);

  let draft = $state({ targetRoles: '', positive: '', negative: '', mustHave: '', strongPlus: '', hardNo: '' });

  // svelte-ignore state_referenced_locally — initial seed only
  let comp = $state({
    target_range: data.initial.target_range,
    currency: data.initial.currency || 'USD',
    minimum: data.initial.minimum,
  });

  let saving = $state(false);

  function addChip(list: 'targetRoles' | 'positive' | 'negative' | 'mustHave' | 'strongPlus' | 'hardNo') {
    const v = draft[list].trim();
    if (!v) return;
    const arr =
      list === 'targetRoles' ? targetRoles :
      list === 'positive'    ? positive :
      list === 'negative'    ? negative :
      list === 'mustHave'    ? mustHave :
      list === 'strongPlus'  ? strongPlus :
                               hardNo;
    if (arr.some((x) => x.toLowerCase() === v.toLowerCase())) {
      draft[list] = '';
      return;
    }
    if (list === 'targetRoles') targetRoles = [...targetRoles, v];
    else if (list === 'positive') positive = [...positive, v];
    else if (list === 'negative') negative = [...negative, v];
    else if (list === 'mustHave') mustHave = [...mustHave, v];
    else if (list === 'strongPlus') strongPlus = [...strongPlus, v];
    else hardNo = [...hardNo, v];
    draft[list] = '';
  }

  function removeChip(list: 'targetRoles' | 'positive' | 'negative' | 'mustHave' | 'strongPlus' | 'hardNo', i: number) {
    if (list === 'targetRoles') targetRoles = targetRoles.filter((_, idx) => idx !== i);
    else if (list === 'positive') positive = positive.filter((_, idx) => idx !== i);
    else if (list === 'negative') negative = negative.filter((_, idx) => idx !== i);
    else if (list === 'mustHave') mustHave = mustHave.filter((_, idx) => idx !== i);
    else if (list === 'strongPlus') strongPlus = strongPlus.filter((_, idx) => idx !== i);
    else hardNo = hardNo.filter((_, idx) => idx !== i);
  }

  function onKeyEnter(e: KeyboardEvent, list: 'targetRoles' | 'positive' | 'negative' | 'mustHave' | 'strongPlus' | 'hardNo') {
    if (e.key === 'Enter' || (e.key === ',' && draft[list].trim())) {
      e.preventDefault();
      addChip(list);
    }
  }

  async function saveAndContinue() {
    if (saving) return;
    if (targetRoles.length === 0) {
      toast.error('Add at least one target role');
      return;
    }
    if (positive.length === 0) {
      toast.error('Add at least one positive keyword');
      return;
    }
    saving = true;
    try {
      // Profile patch: target_roles + compensation + preferences.
      const profilePatch: Record<string, unknown> = {
        target_roles: { primary: targetRoles },
        compensation: stripEmpty({
          target_range: comp.target_range,
          currency: comp.currency,
          minimum: comp.minimum,
        }),
        preferences: {
          must_have: mustHave,
          strong_plus: strongPlus,
          hard_no: hardNo,
        },
      };
      await api.post('/api/profile', profilePatch, { silent: true });

      // Portals patch: title_filter.positive + .negative (preserves rest).
      await api.post('/api/portals/title-filter', { positive, negative }, { silent: true });

      await api.post('/api/onboarding/step', { step: 'targeting', action: 'complete' }, { silent: true });
      toast.success('Targeting saved');
      await goto('/onboarding/sources');
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not save', { description: err.message });
      saving = false;
    }
  }

  function stripEmpty(o: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v && v.trim()));
  }
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
      <Target class="size-5 text-rose-400" />
      Targeting
    </h1>
    <p class="text-sm text-muted-foreground leading-relaxed max-w-xl">
      Target roles drive the LinkedIn / Indeed search queries. Positive + negative keywords drive
      the title-level filter that scan.mjs uses to skip irrelevant postings. Compensation +
      preferences feed the deeper Claude evaluation later.
    </p>
    {#if data.bootstrappedFromTemplate}
      <p class="text-[11px] text-blue-300">
        We'll seed your <code class="font-mono">portals.yml</code> from the curated 100+-company
        template the first time you save.
      </p>
    {/if}
  </header>

  <!-- Target roles -->
  <section class="space-y-2">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target roles</h2>
    <p class="text-[11px] text-muted-foreground/80">
      Job titles you want to find. Examples: "Senior Software Engineer", "Forward Deployed
      Engineer", "Solutions Architect", "AI Product Manager". Press Enter or comma to add.
    </p>
    <div class="flex flex-wrap gap-1.5">
      {#each targetRoles as role, i (role + '-' + i)}
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-[11px]">
          {role}
          <button type="button" onclick={() => removeChip('targetRoles', i)} class="hover:text-rose-300" aria-label="Remove">
            <X class="size-3" />
          </button>
        </span>
      {/each}
    </div>
    <div class="flex gap-2">
      <Input
        bind:value={draft.targetRoles}
        onkeydown={(e) => onKeyEnter(e, 'targetRoles')}
        placeholder="Senior Backend Engineer"
        class="text-sm"
      />
      <Button variant="outline" size="sm" class="h-9 gap-1 flex-shrink-0" onclick={() => addChip('targetRoles')}>
        <Plus class="size-3" /> Add
      </Button>
    </div>
  </section>

  <!-- Title filter -->
  <section class="space-y-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title filter</h2>
    <p class="text-[11px] text-muted-foreground/80">
      Used by the portal scanner to decide if a job title is relevant. A title needs to match ≥1
      positive AND 0 negatives.
    </p>

    <!-- Positive -->
    <div class="space-y-1.5">
      <Label class="text-xs">Positive keywords</Label>
      <div class="flex flex-wrap gap-1.5">
        {#each positive as kw, i (kw + '-' + i)}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px]">
            {kw}
            <button type="button" onclick={() => removeChip('positive', i)} class="hover:text-emerald-300" aria-label="Remove">
              <X class="size-2.5" />
            </button>
          </span>
        {/each}
      </div>
      <div class="flex gap-2">
        <Input
          bind:value={draft.positive}
          onkeydown={(e) => onKeyEnter(e, 'positive')}
          placeholder="AI, Agent, Platform, Solutions Architect"
          class="text-sm"
        />
        <Button variant="outline" size="sm" class="h-9 gap-1 flex-shrink-0" onclick={() => addChip('positive')}>
          <Plus class="size-3" /> Add
        </Button>
      </div>
    </div>

    <!-- Negative -->
    <div class="space-y-1.5">
      <Label class="text-xs">Negative keywords <span class="text-[10px] text-muted-foreground/70">(defaults shown — edit freely)</span></Label>
      <div class="flex flex-wrap gap-1.5">
        {#each negative as kw, i (kw + '-' + i)}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-[10px]">
            {kw}
            <button type="button" onclick={() => removeChip('negative', i)} class="hover:text-red-300" aria-label="Remove">
              <X class="size-2.5" />
            </button>
          </span>
        {/each}
      </div>
      <div class="flex gap-2">
        <Input
          bind:value={draft.negative}
          onkeydown={(e) => onKeyEnter(e, 'negative')}
          placeholder="Junior, Intern, .NET"
          class="text-sm"
        />
        <Button variant="outline" size="sm" class="h-9 gap-1 flex-shrink-0" onclick={() => addChip('negative')}>
          <Plus class="size-3" /> Add
        </Button>
      </div>
    </div>
  </section>

  <!-- Compensation -->
  <section class="space-y-2">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compensation</h2>
    <p class="text-[11px] text-muted-foreground/80">
      Used by the deeper Claude evaluation to flag underpaying offers. Free text — formats like
      "$140k–$180k" or "€90k–€120k" both work.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <Label for="target_range" class="text-xs">Target range</Label>
        <Input id="target_range" bind:value={comp.target_range} placeholder="$140k–$180k" class="text-sm" />
      </div>
      <div>
        <Label for="minimum" class="text-xs">Minimum acceptable</Label>
        <Input id="minimum" bind:value={comp.minimum} placeholder="$120k" class="text-sm" />
      </div>
      <div>
        <Label for="currency" class="text-xs">Currency</Label>
        <Input id="currency" bind:value={comp.currency} placeholder="USD" class="text-sm" />
      </div>
    </div>
  </section>

  <!-- Preferences -->
  <section class="space-y-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hard preferences</h2>
    <p class="text-[11px] text-muted-foreground/80">
      Drives the Claude evaluation's hard-fit checks. Examples for must-have: "remote", "Series
      B+", "AI/ML focus". For hard-no: "on-site only", "below $120k", "≤20 person team".
    </p>

    <!-- Must have -->
    <div class="space-y-1.5">
      <Label class="text-xs">Must have</Label>
      <div class="flex flex-wrap gap-1.5">
        {#each mustHave as p, i (p + '-' + i)}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-[10px]">
            {p}
            <button type="button" onclick={() => removeChip('mustHave', i)} class="hover:text-blue-300" aria-label="Remove"><X class="size-2.5" /></button>
          </span>
        {/each}
      </div>
      <div class="flex gap-2">
        <Input bind:value={draft.mustHave} onkeydown={(e) => onKeyEnter(e, 'mustHave')} placeholder="remote, AI/ML focus" class="text-sm" />
        <Button variant="outline" size="sm" class="h-9 gap-1 flex-shrink-0" onclick={() => addChip('mustHave')}>
          <Plus class="size-3" /> Add
        </Button>
      </div>
    </div>

    <!-- Strong plus -->
    <div class="space-y-1.5">
      <Label class="text-xs">Strong plus</Label>
      <div class="flex flex-wrap gap-1.5">
        {#each strongPlus as p, i (p + '-' + i)}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px]">
            {p}
            <button type="button" onclick={() => removeChip('strongPlus', i)} class="hover:text-amber-300" aria-label="Remove"><X class="size-2.5" /></button>
          </span>
        {/each}
      </div>
      <div class="flex gap-2">
        <Input bind:value={draft.strongPlus} onkeydown={(e) => onKeyEnter(e, 'strongPlus')} placeholder="founding team, equity heavy" class="text-sm" />
        <Button variant="outline" size="sm" class="h-9 gap-1 flex-shrink-0" onclick={() => addChip('strongPlus')}>
          <Plus class="size-3" /> Add
        </Button>
      </div>
    </div>

    <!-- Hard no -->
    <div class="space-y-1.5">
      <Label class="text-xs">Hard no</Label>
      <div class="flex flex-wrap gap-1.5">
        {#each hardNo as p, i (p + '-' + i)}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-[10px]">
            {p}
            <button type="button" onclick={() => removeChip('hardNo', i)} class="hover:text-red-300" aria-label="Remove"><X class="size-2.5" /></button>
          </span>
        {/each}
      </div>
      <div class="flex gap-2">
        <Input bind:value={draft.hardNo} onkeydown={(e) => onKeyEnter(e, 'hardNo')} placeholder="on-site only, below $120k" class="text-sm" />
        <Button variant="outline" size="sm" class="h-9 gap-1 flex-shrink-0" onclick={() => addChip('hardNo')}>
          <Plus class="size-3" /> Add
        </Button>
      </div>
    </div>
  </section>

  <div class="flex items-center justify-between pt-4 border-t border-border/40">
    <a href="/onboarding/cv" class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
      <ArrowLeft class="size-3" /> Back
    </a>
    <Button onclick={saveAndContinue} disabled={saving} class="gap-1.5">
      {#if saving}<Loader2 class="size-3.5 animate-spin" /> Saving…{:else}Continue<ArrowRight class="size-4" />{/if}
    </Button>
  </div>
</div>
