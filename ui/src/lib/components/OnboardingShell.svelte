<!--
  OnboardingShell — sidebar + main pane wrapper for /onboarding/* routes.

  The sidebar shows step progress (complete / current / pending / skipped)
  and lets the user jump back to a completed step. The main pane is a
  slot for the per-step page.

  Step labels + canonical order live in $lib/server/onboarding STEPS;
  this component reads `progress` from layout data, so /onboarding routes
  don't have to know the order themselves.
-->
<script lang="ts">
  import { CheckCircle2, Circle, ArrowRight, Sparkles } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { APP_NAME } from '$lib/config/branding';

  type StepStatus = 'complete' | 'skipped' | 'current' | 'pending';
  type StepRow = { step: string; status: StepStatus };

  let {
    progress,
    current,
    children,
  }: {
    progress: StepRow[];
    current: string;
    children: import('svelte').Snippet;
  } = $props();

  const STEP_LABELS: Record<string, string> = {
    welcome: 'Welcome',
    'api-keys': 'API keys',
    identity: 'Identity',
    cv: 'CV',
    targeting: 'Targeting',
    sources: 'Sources',
    'first-scan': 'First scan',
    done: 'Done',
  };

  const STEP_HREFS: Record<string, string> = {
    welcome: '/onboarding',
    'api-keys': '/onboarding/api-keys',
    identity: '/onboarding/identity',
    cv: '/onboarding/cv',
    targeting: '/onboarding/targeting',
    sources: '/onboarding/sources',
    'first-scan': '/onboarding/first-scan',
    done: '/onboarding/done',
  };

  // Show "current" tint on the active step regardless of what state.json says.
  let visible = $derived(
    progress.map((p) => ({
      ...p,
      status: p.step === current ? ('current' as StepStatus) : p.status,
    })),
  );
</script>

<div class="min-h-screen flex bg-background text-foreground">
  <!-- Sidebar -->
  <aside class="w-64 border-r border-border/40 bg-muted/10 flex flex-col p-5 gap-4">
    <div class="flex items-center gap-2 mb-2">
      <div
        class="size-8 rounded-md bg-fuchsia-500/15 ring-1 ring-fuchsia-500/40 flex items-center justify-center"
      >
        <Sparkles class="size-4 text-fuchsia-300" />
      </div>
      <div>
        <div class="text-sm font-semibold">{APP_NAME}</div>
        <div class="text-[10px] text-muted-foreground">First-time setup</div>
      </div>
    </div>

    <nav class="space-y-0.5">
      {#each visible as row, i (row.step)}
        {@const label = STEP_LABELS[row.step] ?? row.step}
        {@const href = STEP_HREFS[row.step] ?? '/onboarding'}
        {@const isComplete = row.status === 'complete'}
        {@const isCurrent = row.status === 'current'}
        {@const isSkipped = row.status === 'skipped'}
        {@const clickable = isComplete || isCurrent || isSkipped}
        <a
          {href}
          class={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors',
            isCurrent && 'bg-fuchsia-500/15 text-fuchsia-200',
            isComplete &&
              !isCurrent &&
              'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            isSkipped && !isCurrent && 'text-amber-400/80 hover:bg-muted/40',
            row.status === 'pending' && 'text-muted-foreground/40 pointer-events-none',
          )}
          aria-current={isCurrent ? 'step' : undefined}
          tabindex={clickable ? 0 : -1}
        >
          {#if isComplete}
            <CheckCircle2 class="size-3.5 text-emerald-400 flex-shrink-0" />
          {:else if isCurrent}
            <ArrowRight class="size-3.5 text-fuchsia-300 flex-shrink-0" />
          {:else if isSkipped}
            <Circle class="size-3.5 text-amber-400/70 flex-shrink-0" />
          {:else}
            <Circle class="size-3.5 text-muted-foreground/30 flex-shrink-0" />
          {/if}
          <span class="flex-1 truncate">{label}</span>
          <span class="text-[9px] tabular-nums text-muted-foreground/50">{i + 1}</span>
        </a>
      {/each}
    </nav>

    <div class="flex-1"></div>

    <div
      class="text-[10px] text-muted-foreground/60 leading-relaxed border-t border-border/40 pt-3"
    >
      Estimated time: 5–10 minutes. You can come back to any completed step from this sidebar — your
      work is auto-saved as you go.
    </div>
  </aside>

  <!-- Main pane -->
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-2xl mx-auto p-8 lg:p-12">
      {@render children()}
    </div>
  </main>
</div>
