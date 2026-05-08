<!--
  JobActions — the SHARED per-job action menu used by every pipeline view
  (board card, list row, compact row, table row, by-company row) AND the
  job-detail page's hero. Single source of truth for:

    * Change status   (drives /api/status)
    * Apply           (linkedin / open-and-mark / mark — drives /api/job/[id]/apply)
    * Generate CV     (drives /api/job/[id]/cv via runOferta)
    * Open posting    (target=_blank on the URL)
    * Copy URL        (clipboard)

  The component absorbs the network calls and toast notifications so callers
  never duplicate the apply/status/CV dance. After every successful mutation
  it fires SvelteKit's invalidateAll() so all visible views refresh.

  Visual variants:
    * size="row"    — small icon-only triggers (used in dense rows: compact / list / table)
    * size="card"   — slightly larger triggers with abbreviated labels (board / by-company)
    * size="hero"   — full labelled buttons (job detail page)
-->
<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import {
    ChevronDown, MoreHorizontal, Send, Check, ClipboardCheck, ArrowUpRight,
    Sparkles, ExternalLink, Copy, FileBadge2, FileText, Network as Linkedin,
    Loader2, Wand2,
  } from '@lucide/svelte';
  import CheckMark from './CheckMark.svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
  import { withMinDuration, cn } from '$lib/utils';
  import type { Job, Status } from '$lib/types';
  import { STATUS_ORDER } from '$lib/types';

  type Size = 'row' | 'card' | 'hero';
  type ApplyMode = 'linkedin' | 'open-and-mark' | 'mark';

  let {
    job,
    size = 'row',
    align = 'end',
  }: {
    job: Job;
    size?: Size;
    align?: 'start' | 'center' | 'end';
  } = $props();

  // ---------- derived state ----------
  let isLinkedIn = $derived(!!job.url && /linkedin\.com/.test(job.url));
  let isApplied = $derived(['Applied', 'Screened', 'Interview', 'Offer', 'Rejected'].includes(job.status));
  let hasPdf = $derived(!!job.pdfFile);
  let hasReport = $derived(!!job.reportFile);

  let applyBusy = $state<ApplyMode | null>(null);
  let cvBusy = $state(false);
  let statusBusy = $state(false);

  const STATUS_DOTS: Record<Status, string> = {
    New: 'bg-zinc-400', Scoring: 'bg-blue-400', Scored: 'bg-cyan-400',
    Ready: 'bg-emerald-400', Applied: 'bg-violet-400', Screened: 'bg-amber-400',
    Interview: 'bg-orange-400', Offer: 'bg-green-400', Rejected: 'bg-red-400', Closed: 'bg-zinc-500',
  };
  const STATUS_HINT: Record<Status, string> = {
    New: 'Just discovered — no score yet',
    Scoring: 'Gemini is processing this job',
    Scored: 'Has a Gemini score · review and promote',
    Ready: 'Eval done · CV PDF ready · go apply',
    Applied: 'Application sent',
    Screened: 'Recruiter responded',
    Interview: 'Active interview process',
    Offer: 'Offer in hand · negotiate',
    Rejected: 'Closed by company',
    Closed: 'You skipped this one',
  };

  // ---------- actions ----------
  // Compose a "<Company> · <Role>" subtitle that's used as the description on
  // every toast so the user always knows which job a notification is about.
  let jobLabel = $derived(
    job.company && job.role
      ? job.company + ' · ' + job.role
      : job.company || job.role || 'Job',
  );

  async function changeStatus(newStatus: Status) {
    if (!job.url || statusBusy) return;
    statusBusy = true;
    try {
      await withMinDuration(
        api.post('/api/status', { url: job.url, newStatus }, { silent: true }),
        300,
      );
      toast.success('Status → ' + newStatus, { description: jobLabel });
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Status update failed', {
        description: jobLabel + ' — ' + err.message,
        action: { label: 'Retry', onClick: () => changeStatus(newStatus) },
        duration: 10_000,
      });
    } finally {
      statusBusy = false;
    }
  }

  async function apply(mode: ApplyMode) {
    if (!job.id || applyBusy) return;
    applyBusy = mode;
    try {
      // open-and-mark: open the URL on the client, server flips status only
      if (mode === 'open-and-mark' && job.url) {
        window.open(job.url, '_blank', 'noopener');
      }
      const r = await withMinDuration(
        api.post<{ ok: boolean; mode: string; message: string }>(
          '/api/job/' + encodeURIComponent(job.id) + '/apply',
          { mode },
          { silent: true },
        ),
        500,
      );
      if (r.ok) {
        if (mode === 'linkedin') {
          toast.success('LinkedIn Easy Apply started', {
            description: jobLabel + ' — watch the bell (top-right) for per-step events. A success/failure toast will pop on completion.',
            duration: 8_000,
          });
        } else if (mode === 'open-and-mark') {
          toast.success('Opened posting · marked Applied', {
            description: jobLabel + ' — finish the form in the new tab; the tracker is already updated.',
            duration: 8_000,
          });
        } else {
          toast.success('Marked as Applied', {
            description: jobLabel + ' — moved to /applied. Use the status dropdown to escalate to Screened/Interview.',
            duration: 6_000,
          });
        }
      }
      await invalidateAll();
    } catch (e) {
      const err = e as ApiError;
      toast.error('Apply failed', {
        description: jobLabel + ' — ' + err.message,
        action: { label: 'Retry', onClick: () => apply(mode) },
        duration: 12_000,
      });
    } finally {
      applyBusy = null;
    }
  }

  async function generateCv() {
    if (!job.id || cvBusy) return;
    cvBusy = true;
    try {
      const r = await withMinDuration(
        api.post<{ ok: boolean; message: string }>(
          '/api/job/' + encodeURIComponent(job.id) + '/cv',
          {},
          { silent: true },
        ),
        500,
      );
      if (r.ok) {
        toast.success('Generating tailored CV', {
          description: jobLabel + ' — ~1–3 min. Watch the bell for "Generate CV finished" or "Generate CV failed".',
          duration: 8_000,
        });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('CV generation failed', {
        description: jobLabel + ' — ' + err.message + '. Claude Code CLI must be on PATH for this to work.',
        action: { label: 'Retry', onClick: () => generateCv() },
        duration: 12_000,
      });
    } finally {
      cvBusy = false;
    }
  }

  async function copyUrl() {
    if (!job.url) return;
    try {
      await navigator.clipboard.writeText(job.url);
      toast.success('URL copied');
    } catch {
      toast.error('Copy failed', { description: 'Browser blocked clipboard access.' });
    }
  }

  // Stop click bubbling so JobActions inside <a href="/job/..."> wrappers
  // doesn't trigger anchor navigation when the user opens a dropdown. We
  // intentionally don't preventDefault so child buttons still fire.
  function stopBubble(e: MouseEvent) { e.stopPropagation(); }
</script>

<!--
  Three pieces side-by-side: Apply (primary CTA) · Status · ⋯ More.
-->
<div
  class={cn(
    'flex items-center gap-1 flex-shrink-0',
    size === 'hero' && 'gap-2',
  )}
  onclick={stopBubble}
  role="presentation"
>
  <!-- ============ APPLY MENU ============ -->
  <!--
    Canonical bits-ui pattern: DropdownMenu.Root outermost, Tooltip nested INSIDE,
    DropdownMenu.Trigger nested inside Tooltip.Trigger so spread order is
    {...tipProps} {...ddProps} → DropdownMenu's onclick wins. This matches
    NotificationsBell.svelte and StatusColumn.svelte (both verified working).
  -->
  <DropdownMenu.Root>
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props: tipProps })}
            <DropdownMenu.Trigger>
              {#snippet child({ props: ddProps })}
                {#if size === 'hero'}
                  <Button
                    {...tipProps}
                    {...ddProps}
                    variant={isApplied ? 'outline' : 'default'}
                    size="sm"
                    class="h-9 gap-1.5"
                    disabled={!!applyBusy}
                  >
                    {#if applyBusy}
                      <Loader2 class="size-3.5 animate-spin" />
                      <span>Applying…</span>
                    {:else if isApplied}
                      <ClipboardCheck class="size-3.5 text-emerald-400" />
                      <span>Apply again</span>
                      <ChevronDown class="size-3 opacity-60" />
                    {:else}
                      <Send class="size-3.5" />
                      <span>Apply</span>
                      <ChevronDown class="size-3 opacity-60" />
                    {/if}
                  </Button>
                {:else}
                  <Button
                    {...tipProps}
                    {...ddProps}
                    variant="ghost"
                    size="icon"
                    class={cn(
                      size === 'card' ? 'size-7' : 'size-7',
                      isApplied && 'text-emerald-400',
                    )}
                    disabled={!!applyBusy}
                    aria-label="Apply"
                  >
                    {#if applyBusy}
                      <Loader2 class="size-3.5 animate-spin" />
                    {:else if isApplied}
                      <ClipboardCheck class="size-3.5" />
                    {:else}
                      <Send class="size-3.5" />
                    {/if}
                  </Button>
                {/if}
              {/snippet}
            </DropdownMenu.Trigger>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top" class="text-xs max-w-xs">
          {#if isApplied}
            Already marked Applied — open menu to apply again or change status.
          {:else if isLinkedIn}
            Apply via LinkedIn Easy Apply (auto), or open posting and mark applied.
          {:else}
            Open the posting in a new tab and mark applied.
          {/if}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
    <DropdownMenu.Content side="bottom" {align} class="w-72">
      <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground">
        Apply to this job
      </DropdownMenu.Label>

      {#if isLinkedIn}
        <DropdownMenu.Item
          onSelect={() => apply('linkedin')}
          closeOnSelect={false}
          class="gap-2 items-start py-2"
        >
          <Linkedin class="size-3.5 mt-0.5 text-blue-400 flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium">LinkedIn Easy Apply</div>
            <div class="text-[10px] text-muted-foreground/70 leading-tight">
              Playwright fills + (optionally) submits. Watch the bell for progress.
            </div>
          </div>
          {#if applyBusy === 'linkedin'}<Loader2 class="size-3 animate-spin mt-1" />{/if}
        </DropdownMenu.Item>
      {:else}
        <div class="px-2 py-1.5 text-[10px] text-muted-foreground/70 leading-tight border-l-2 border-amber-500/40 ml-2 mr-2 my-1 bg-amber-500/5 rounded-sm py-1.5 px-2">
          Not a LinkedIn URL — Easy Apply automation isn't available.
          Use Open &amp; Mark Applied to walk through the posting yourself.
        </div>
      {/if}

      <DropdownMenu.Item
        onSelect={() => apply('open-and-mark')}
        closeOnSelect={false}
        class="gap-2 items-start py-2"
        disabled={!job.url}
      >
        <ArrowUpRight class="size-3.5 mt-0.5 text-violet-400 flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium">Open posting &amp; mark Applied</div>
          <div class="text-[10px] text-muted-foreground/70 leading-tight">
            Opens the URL in a new tab and flips status. You finish the form by hand.
          </div>
        </div>
        {#if applyBusy === 'open-and-mark'}<Loader2 class="size-3 animate-spin mt-1" />{/if}
      </DropdownMenu.Item>

      <DropdownMenu.Item
        onSelect={() => apply('mark')}
        closeOnSelect={false}
        class="gap-2 items-start py-2"
      >
        <ClipboardCheck class="size-3.5 mt-0.5 text-emerald-400 flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium">Mark Applied (no open)</div>
          <div class="text-[10px] text-muted-foreground/70 leading-tight">
            Status flip only — use when you applied elsewhere or want to skip.
          </div>
        </div>
        {#if applyBusy === 'mark'}<Loader2 class="size-3 animate-spin mt-1" />{/if}
      </DropdownMenu.Item>

      <DropdownMenu.Separator />
      <div class="px-3 py-1.5 text-[10px] text-muted-foreground/60 leading-tight">
        Notifications: success/failure toasts pop here, the bell logs every event,
        and failed jobs surface a Retry button on the toast.
      </div>
    </DropdownMenu.Content>
  </DropdownMenu.Root>

  <!-- ============ STATUS DROPDOWN ============ -->
  <DropdownMenu.Root>
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props: tipProps })}
            <DropdownMenu.Trigger>
              {#snippet child({ props: ddProps })}
                {#if size === 'hero'}
                  <Button {...tipProps} {...ddProps} variant="outline" size="sm" class="h-9 gap-1.5">
                    <span class={cn('size-1.5 rounded-full', STATUS_DOTS[job.status])}></span>
                    <span class="text-xs">{job.status}</span>
                    <ChevronDown class="size-3 opacity-60" />
                  </Button>
                {:else}
                  <Button
                    {...tipProps}
                    {...ddProps}
                    variant="ghost"
                    size="icon"
                    class="size-7"
                    aria-label="Change status"
                  >
                    <span class={cn('size-2 rounded-full', STATUS_DOTS[job.status])}></span>
                  </Button>
                {/if}
              {/snippet}
            </DropdownMenu.Trigger>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top" class="text-xs max-w-xs">
          <div class="font-medium">Status: {job.status}</div>
          <div class="text-muted-foreground">{STATUS_HINT[job.status]}</div>
          <div class="text-muted-foreground/70 mt-1 text-[10px]">Click to change</div>
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
    <DropdownMenu.Content side="bottom" {align} class="w-64 max-h-72 overflow-y-auto">
      <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground">Change status</DropdownMenu.Label>
      {#each STATUS_ORDER as s}
        <DropdownMenu.Item
          onSelect={() => changeStatus(s)}
          closeOnSelect={false}
          class="gap-2 items-start py-1.5"
        >
          <span class={cn('size-1.5 rounded-full mt-1.5 flex-shrink-0', STATUS_DOTS[s])}></span>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium">{s}</div>
            <div class="text-[10px] text-muted-foreground/70 leading-tight">{STATUS_HINT[s]}</div>
          </div>
          <CheckMark active={s === job.status} class="mt-0.5" />
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>

  <!-- ============ MORE / OVERFLOW ============ -->
  <DropdownMenu.Root>
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props: tipProps })}
            <DropdownMenu.Trigger>
              {#snippet child({ props: ddProps })}
                <Button
                  {...tipProps}
                  {...ddProps}
                  variant="ghost"
                  size="icon"
                  class={cn(size === 'hero' ? 'size-9' : 'size-7')}
                  aria-label="More actions"
                >
                  <MoreHorizontal class="size-3.5" />
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top" class="text-xs">More actions</Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
    <DropdownMenu.Content side="bottom" {align} class="w-72">
      <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground">Tools</DropdownMenu.Label>

      <DropdownMenu.Item
        onSelect={generateCv}
        closeOnSelect={false}
        class="gap-2 items-start py-2"
        disabled={!job.url || cvBusy}
      >
        {#if cvBusy}
          <Loader2 class="size-3.5 mt-0.5 animate-spin flex-shrink-0" />
        {:else}
          <Wand2 class="size-3.5 mt-0.5 text-amber-400 flex-shrink-0" />
        {/if}
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium">
            {hasPdf ? 'Regenerate tailored CV' : 'Generate tailored CV'}
          </div>
          <div class="text-[10px] text-muted-foreground/70 leading-tight">
            Spawns Claude oferta — produces a deep eval report + CV PDF. 1–3 min per job.
          </div>
        </div>
      </DropdownMenu.Item>

      <DropdownMenu.Separator />
      <DropdownMenu.Label class="text-[10px] uppercase tracking-wide text-muted-foreground">Open</DropdownMenu.Label>

      {#if job.url}
        <DropdownMenu.Item
          onSelect={() => window.open(job.url, '_blank', 'noopener')}
          class="gap-2 items-start py-1.5"
        >
          <ExternalLink class="size-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-xs">Open posting</div>
            <div class="text-[10px] text-muted-foreground/70 leading-tight font-mono truncate">{job.url}</div>
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasReport}
        <DropdownMenu.Item
          onSelect={() => location.assign('/job/' + job.id + '#report')}
          class="gap-2 items-start py-1.5"
        >
          <FileText class="size-3.5 mt-0.5 text-blue-400 flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-xs">View deep evaluation</div>
            <div class="text-[10px] text-muted-foreground/70 leading-tight">7-block A–G report</div>
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasPdf}
        <DropdownMenu.Item
          onSelect={() => window.open('/api/job/' + job.id + '/pdf', '_blank', 'noopener')}
          class="gap-2 items-start py-1.5"
        >
          <FileBadge2 class="size-3.5 mt-0.5 text-emerald-400 flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-xs">Open tailored CV PDF</div>
            <div class="text-[10px] text-muted-foreground/70 leading-tight">{job.pdfFile}</div>
          </div>
        </DropdownMenu.Item>
      {/if}

      <DropdownMenu.Separator />

      <DropdownMenu.Item
        onSelect={copyUrl}
        closeOnSelect={false}
        class="gap-2 items-start py-1.5"
        disabled={!job.url}
      >
        <Copy class="size-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-xs">Copy URL</div>
        </div>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</div>
