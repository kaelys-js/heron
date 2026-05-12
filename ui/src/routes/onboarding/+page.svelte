<script lang="ts">
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import {
  Sparkles,
  KeyRound,
  User,
  FileText,
  Target,
  Plug,
  Search,
  Trophy,
  ArrowRight,
  Plus,
  Loader2,
} from '@lucide/svelte';
import { goto } from '$app/navigation';
import { api, ApiError } from '$lib/api';
import { toast } from 'svelte-sonner';
import { cn } from '$lib/utils';
import type { Profile, ProfileColor } from '$lib/server/profiles';

const PROFILE_COLORS: ProfileColor[] = [
  'blue',
  'emerald',
  'violet',
  'amber',
  'rose',
  'cyan',
  'orange',
  'pink',
];

let {
  data,
}: {
  data: {
    state: import('$lib/server/onboarding').OnboardingState;
    progress: { step: string; status: 'complete' | 'skipped' | 'current' | 'pending' }[];
    profileId?: string;
    isNewProfile: boolean;
    profiles: Profile[];
  };
} = $props();

let resuming = $derived(data.state.completedSteps.length > 0 && !data.state.completed);
let isNewProfile = $derived(data.isNewProfile && !data.profileId);
let hasMultipleProfiles = $derived(data.profiles.length >= 1);

// New-profile creation state (only used when isNewProfile === true)
let newName = $state('');
let newColor = $state<ProfileColor>('blue');
let creating = $state(false);

const STEPS = [
  {
    icon: KeyRound,
    label: 'API keys',
    blurb: 'Anthropic + Gemini (free tier OK). Shared across profiles.',
    href: '/onboarding/api-keys',
  },
  {
    icon: User,
    label: 'Identity',
    blurb: 'Name, email, location, work auth — per profile.',
    href: '/onboarding/identity',
  },
  {
    icon: FileText,
    label: 'CV',
    blurb: "Paste your CV — we'll convert it to markdown if needed.",
    href: '/onboarding/cv',
  },
  {
    icon: Target,
    label: 'Targeting',
    blurb: 'Target roles, keywords, salary, hard preferences — per profile.',
    href: '/onboarding/targeting',
  },
  {
    icon: Plug,
    label: 'Sources',
    blurb: 'Connect LinkedIn / Indeed / Gmail. Shared across profiles.',
    href: '/onboarding/sources',
  },
  {
    icon: Search,
    label: 'First scan',
    blurb: 'Find jobs across every connected source — usually 1–3 minutes.',
    href: '/onboarding/first-scan',
  },
];

let busy = $state(false);

/** Dot color helper for the color picker. */
function dot(c: string): string {
  const map: Record<string, string> = {
    blue: 'bg-blue-400',
    emerald: 'bg-emerald-400',
    violet: 'bg-violet-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    cyan: 'bg-cyan-400',
    orange: 'bg-orange-400',
    pink: 'bg-pink-400',
  };
  return map[c] ?? 'bg-zinc-400';
}

async function createAndContinue() {
  const trimmed = newName.trim();
  if (!trimmed) {
    toast.error('Profile name required');
    return;
  }
  if (creating) return;
  creating = true;
  try {
    // POST to /api/profiles/active doesn't create — we need a CREATE
    // endpoint. Since /api/profiles supports POST creation? Let me use
    // the profiles.ts createProfile via a dedicated POST.
    const r = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, color: newColor }),
    });
    if (!r.ok) {
      const json = await r.json().catch(() => ({}));
      throw new Error(json?.error?.message ?? 'create failed');
    }
    const created = await r.json();
    const newId = created?.profile?.id;
    if (!newId) throw new Error('server did not return a profile id');
    toast.success('Profile created: ' + trimmed);
    // Onboarding-state should reset for the new profile run.
    await api.post('/api/onboarding/reset', {}, { silent: true });
    await goto('/onboarding/api-keys?profile=' + encodeURIComponent(newId));
  } catch (e) {
    const err = e as Error;
    toast.error('Could not create profile', { description: err.message });
    creating = false;
  }
}

async function skipAdvanced() {
  if (
    !confirm(
      "Skip onboarding? This marks setup complete without populating cv.md / profile.yml. Only do this if you've set everything up by hand already.",
    )
  )
    return;
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

function continueHref(): string {
  const baseStep = resuming ? (data.state.currentStep ?? 'api-keys') : 'api-keys';
  const q = data.profileId ? '?profile=' + encodeURIComponent(data.profileId) : '';
  return '/onboarding/' + baseStep + q;
}
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight flex items-center gap-2">
      <Sparkles class="size-6 text-fuchsia-400" />
      {isNewProfile ? 'Add a new profile' : 'Welcome to career-ops'}
    </h1>
    <p class="text-sm text-muted-foreground leading-relaxed max-w-xl">
      {#if isNewProfile}
        Each profile is its own distinct career track — a different CV, different target roles,
        different pipeline. Existing API keys and connected sources (LinkedIn / Indeed / Gmail) are
        reused. Below: pick a name + color, then walk through the same per-profile steps.
      {:else}
        A few quick steps and you'll have a job pipeline that scans every major source on a daily
        schedule, scores each posting against your CV, generates tailored cover letters and CV PDFs,
        and tracks every application end-to-end. Nothing here sends anything on your behalf — you
        review and click Submit yourself.
      {/if}
    </p>
  </header>

  {#if isNewProfile}
    <!-- New-profile creation form -->
    <div class="space-y-4 rounded-md border border-blue-500/30 bg-blue-500/5 p-4">
      <div class="space-y-1.5">
        <Label for="profile-name" class="text-xs">Profile name</Label>
        <Input
          id="profile-name"
          bind:value={newName}
          placeholder="e.g. Software Engineering, Electrician, Accounting"
          class="text-sm"
          autofocus
          onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') createAndContinue(); }}
        />
        <p class="text-[11px] text-muted-foreground/80">
          A short name. The system derives a kebab-case slug for the filesystem path
          (e.g. "Software Engineering" → <code class="font-mono text-[10px]">software-engineering</code>).
        </p>
      </div>

      <div class="space-y-1.5">
        <Label class="text-xs">Color</Label>
        <div class="flex items-center gap-2">
          {#each PROFILE_COLORS as c (c)}
            <button
              type="button"
              onclick={() => (newColor = c)}
              class={cn(
                'size-7 rounded-full transition-transform hover:scale-110',
                dot(c),
                c === newColor && 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-background',
              )}
              aria-label={'Color ' + c}
            ></button>
          {/each}
        </div>
        <p class="text-[11px] text-muted-foreground/80">
          Used for the profile-switcher dot in the sidebar + the badge on each job in cross-profile views.
        </p>
      </div>

      <Button onclick={createAndContinue} disabled={creating || !newName.trim()} class="gap-1.5">
        {#if creating}
          <Loader2 class="size-3.5 animate-spin" /> Creating…
        {:else}
          <Plus class="size-4" /> Create & continue
        {/if}
      </Button>
    </div>
  {:else if resuming}
    <div class="rounded-md border border-blue-500/30 bg-blue-500/5 px-4 py-3">
      <p class="text-xs text-blue-200">
        Resuming where you left off — you've completed
        <strong>{data.state.completedSteps.length}</strong> of 6 steps. Click any step in the
        sidebar to revisit, or continue below.
      </p>
    </div>
  {/if}

  {#if !isNewProfile}
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
      <Button size="lg" class="gap-1.5" onclick={() => goto(continueHref())} disabled={busy}>
        {resuming ? 'Continue setup' : 'Get started'}
        <ArrowRight class="size-4" />
      </Button>

      {#if hasMultipleProfiles && !resuming}
        <Button size="lg" variant="outline" class="gap-1.5" onclick={() => goto('/onboarding?new=1')}>
          <Plus class="size-4" /> Add another profile
        </Button>
      {/if}

      <button
        type="button"
        onclick={skipAdvanced}
        disabled={busy}
        class="text-[11px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2 ml-3"
      >
        Skip — I've set everything up by hand
      </button>
    </div>
  {/if}
</div>
