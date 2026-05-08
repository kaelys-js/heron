<script lang="ts">
  import { ChevronDown, Info, ArrowRight } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import type { Status } from '$lib/types';
  import { cmd } from '$lib/config/branding';

  let { storageKey = 'pipeline-flow-help' }: { storageKey?: string } = $props();
  let fullKey = $derived('career-ops:' + storageKey);

  function readInitial(key: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === '1') return true;
    } catch {}
    return false;
  }
  // svelte-ignore state_referenced_locally — initial seed only
  let open = $state(readInitial('career-ops:' + storageKey));
  $effect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(fullKey, open ? '1' : '0'); } catch {}
  });

  type StateRow = { status: Status; dot: string; from: string; trigger: string };
  const FLOW: StateRow[] = [
    { status: 'New',      dot: 'bg-zinc-400',   from: 'scan',                    trigger: 'Scanner finds the URL · no score yet' },
    { status: 'Scoring',  dot: 'bg-blue-400',   from: 'gemini in flight',        trigger: 'Gemini first-pass is running on this job' },
    { status: 'Scored',   dot: 'bg-cyan-400',   from: 'after gemini',            trigger: 'Has a cheap Gemini score (~0–5). Promote ≥4 to deep eval.' },
    { status: 'Ready',    dot: 'bg-emerald-500',from: 'after deep eval + PDF',   trigger: 'Claude eval done · tailored CV PDF generated · go apply' },
    { status: 'Applied',  dot: 'bg-violet-500', from: 'apply or "Mark Applied"', trigger: 'Application submitted; tracker updated' },
    { status: 'Screened', dot: 'bg-amber-400',  from: 'recruiter reply',         trigger: 'Recruiter responded — usually a phone screen scheduled' },
    { status: 'Interview',dot: 'bg-orange-500', from: 'after screen',            trigger: 'Active interview process · Interview Prep tab unlocks' },
    { status: 'Offer',    dot: 'bg-green-500',  from: 'after interviews',        trigger: 'Offer in hand · Negotiation tab unlocks' },
    { status: 'Rejected', dot: 'bg-red-400',    from: 'company decision',        trigger: 'Closed by company — capture reason in notes' },
    { status: 'Closed',   dot: 'bg-zinc-500',   from: 'your decision',           trigger: 'You skipped — out of pipeline but tracked' },
  ];
</script>

<div class="rounded-md border border-border/40 bg-card overflow-hidden">
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    class="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-muted/40 transition-colors text-left"
  >
    <Info class="size-3.5 text-muted-foreground/80 flex-shrink-0" />
    <span class="text-xs font-medium">How jobs move through your pipeline</span>
    <span class="text-[10px] text-muted-foreground/60 hidden md:inline">— click to {open ? 'hide' : 'show'} the state flow</span>
    <ChevronDown class={cn('size-3.5 ml-auto text-muted-foreground transition-transform', open && 'rotate-180')} />
  </button>

  <!--
    grid-template-rows: 0fr ↔ 1fr animates height smoothly without measuring DOM.
  -->
  <div
    class={cn(
      'grid transition-[grid-template-rows] duration-200 ease-out',
      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
    )}
  >
    <div class="overflow-hidden min-h-0">
      <div class="px-4 pb-4 pt-1 space-y-3 border-t border-border/40">
        <p class="text-[11px] text-muted-foreground leading-relaxed pt-2">
          Open any job, then change <span class="font-medium text-foreground">Properties → Status</span> to move it. Some
          transitions happen automatically: scanning creates <span class="font-mono">New</span>; running Gemini turns it into
          <span class="font-mono">Scored</span>; running deep eval (<span class="font-mono">{cmd('oferta')}</span>) +
          generating a CV PDF promotes it to <span class="font-mono">Ready</span>; using LinkedIn Easy Apply or "Open posting &amp; mark Applied"
          flips to <span class="font-mono">Applied</span>.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
          {#each FLOW as row, i}
            <div class="flex items-start gap-2 text-[11px] leading-relaxed">
              <span class={cn('size-1.5 rounded-full mt-1.5 flex-shrink-0', row.dot)}></span>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-1.5 flex-wrap">
                  <span class="font-medium text-foreground">{row.status}</span>
                  <span class="text-[10px] text-muted-foreground/60">· from {row.from}</span>
                </div>
                <div class="text-muted-foreground">{row.trigger}</div>
              </div>
            </div>
          {/each}
        </div>

        <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 pt-2 border-t border-border/40">
          <span class="font-medium text-foreground/80">Typical happy path:</span>
          <span class="inline-flex items-center gap-0.5 flex-wrap">
            <span class="font-mono">New</span>
            <ArrowRight class="size-2.5 text-muted-foreground/50" />
            <span class="font-mono">Scored</span>
            <ArrowRight class="size-2.5 text-muted-foreground/50" />
            <span class="font-mono text-emerald-300">Ready</span>
            <ArrowRight class="size-2.5 text-muted-foreground/50" />
            <span class="font-mono text-violet-300">Applied</span>
            <ArrowRight class="size-2.5 text-muted-foreground/50" />
            <span class="font-mono text-amber-300">Screened</span>
            <ArrowRight class="size-2.5 text-muted-foreground/50" />
            <span class="font-mono text-orange-300">Interview</span>
            <ArrowRight class="size-2.5 text-muted-foreground/50" />
            <span class="font-mono text-emerald-400">Offer</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</div>
