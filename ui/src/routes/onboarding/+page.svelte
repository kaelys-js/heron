<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Sparkles, KeyRound, User, FileText, Target, Plug, Search, Trophy, ArrowRight } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';

  let { data }: {
    data: {
      state: import('$lib/server/onboarding').OnboardingState;
      progress: { step: string; status: 'complete' | 'skipped' | 'current' | 'pending' }[];
    };
  } = $props();

  let resuming = $derived(data.state.completedSteps.length > 0 && !data.state.completed);

  const STEPS = [
    { icon: KeyRound, label: 'API keys',  blurb: 'Anthropic + Gemini (free tier OK).',                            href: '/onboarding/api-keys' },
    { icon: User,     label: 'Identity',  blurb: 'Name, email, location, work auth.',                              href: '/onboarding/identity' },
    { icon: FileText, label: 'CV',        blurb: 'Paste your CV — we\'ll convert it to markdown if needed.',       href: '/onboarding/cv' },
    { icon: Target,   label: 'Targeting', blurb: 'Target roles, keywords, salary, hard preferences.',              href: '/onboarding/targeting' },
    { icon: Plug,     label: 'Sources',   blurb: 'Connect LinkedIn / Indeed / Gmail for personalised data.',       href: '/onboarding/sources' },
    { icon: Search,   label: 'First scan', blurb: 'Find jobs across every connected source — usually 1–3 minutes.', href: '/onboarding/first-scan' },
  ];

  let busy = $state(false);

  async function skipAdvanced() {
    if (!confirm('Skip onboarding? This marks setup complete without populating cv.md / profile.yml. Only do this if you\'ve set everything up by hand already.')) return;
    busy = true;
    try {
      await api.post('/api/onboarding/complete', { skip: true }, { silent: true });
      toast.info('Onboarding skipped — you can re-run it from /settings');
      await goto('/inbox');
    } catch (e) {
      const err = e as ApiError;
      toast.error('Could not skip', { description: err.message });
      busy = false;
    }
  }
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
      <Sparkles class="size-6 text-fuchsia-400" />
      Welcome to career-ops
    </h1>
    <p class="text-sm text-muted-foreground leading-relaxed max-w-xl">
      A few quick steps and you'll have a job pipeline that scans every major source on a daily
      schedule, scores each posting against your CV, generates tailored cover letters and CV PDFs,
      and tracks every application end-to-end. Nothing here sends anything on your behalf — you
      review and click Submit yourself.
    </p>
  </header>

  {#if resuming}
    <div class="rounded-md border border-blue-500/30 bg-blue-500/5 px-4 py-3">
      <p class="text-xs text-blue-200">
        Resuming where you left off — you've completed
        <strong>{data.state.completedSteps.length}</strong> of 6 steps. Click any step in the
        sidebar to revisit, or continue below.
      </p>
    </div>
  {/if}

  <div class="space-y-2">
    <h2 class="text-sm font-semibold tracking-tight">What we'll set up</h2>
    <div class="space-y-1.5">
      {#each STEPS as s, i (s.label)}
        {@const Icon = s.icon}
        <div class="flex items-start gap-3 px-3 py-2 rounded-md border border-border/40 bg-card">
          <div class="size-7 rounded-md bg-muted/40 ring-1 ring-border/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon class="size-3.5 text-muted-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium">{i + 1}. {s.label}</div>
            <div class="text-[11px] text-muted-foreground leading-relaxed">{s.blurb}</div>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="rounded-md border border-border/40 bg-muted/20 px-4 py-3 space-y-1">
    <h3 class="text-xs font-semibold flex items-center gap-1.5">
      <Trophy class="size-3 text-amber-400" />
      What you'll have at the end
    </h3>
    <ul class="text-[11px] text-muted-foreground/90 list-disc pl-4 leading-relaxed space-y-0.5">
      <li>A daily scan that pulls from your authenticated LinkedIn + Indeed + Gmail alerts + 9 ATS providers + JobSpy aggregators</li>
      <li>Personalized scoring for every job (Gemini first-pass, Claude deep-eval on the high-fit ones)</li>
      <li>One-click tailored CV PDF + cover letter per job that scores ≥4/5</li>
      <li>Status tracking from Discovered → Ready → Applied → Interview → Offer (or Rejected, with patterns analysis)</li>
    </ul>
  </div>

  <div class="flex items-center gap-2 pt-2">
    <Button
      size="lg"
      class="gap-1.5"
      onclick={() => goto(resuming ? '/onboarding/' + (data.state.currentStep ?? 'api-keys') : '/onboarding/api-keys')}
      disabled={busy}
    >
      {resuming ? 'Continue setup' : 'Get started'}
      <ArrowRight class="size-4" />
    </Button>

    <button
      type="button"
      onclick={skipAdvanced}
      disabled={busy}
      class="text-[11px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2 ml-3"
    >
      Skip — I've set everything up by hand
    </button>
  </div>
</div>
