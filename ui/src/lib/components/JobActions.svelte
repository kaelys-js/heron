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
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import {
    ChevronDown, MoreHorizontal, Send, Check, ClipboardCheck, ArrowUpRight,
    Sparkles, ExternalLink, Copy, FileBadge2, FileText, Network as Linkedin,
    Loader2, Wand2, Activity, Bell,
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
  let livenessBusy = $state(false);
  let followupBusy = $state(false);
  let followupDraft = $state<{ path: string; content: string } | null>(null);
  let followupSheetOpen = $state(false);
  let formAnswersBusy = $state(false);
  let formAnswersData = $state<{ path: string; content: string } | null>(null);
  let formAnswersSheetOpen = $state(false);
  let statusBusy = $state(false);

  const STATUS_DOTS: Record<Status, string> = {
    New: 'bg-zinc-400', Scoring: 'bg-blue-400', Scored: 'bg-cyan-400',
    Ready: 'bg-emerald-400', Queued: 'bg-fuchsia-400', Applied: 'bg-violet-400', Screened: 'bg-amber-400',
    Interview: 'bg-orange-400', Offer: 'bg-green-400', Rejected: 'bg-red-400', Closed: 'bg-zinc-500',
  };
  const STATUS_HINT: Record<Status, string> = {
    New: 'Just discovered — no score yet',
    Scoring: 'Gemini is processing this job',
    Scored: 'Has a Gemini score · review and promote',
    Ready: 'Eval done · CV PDF ready · go apply',
    Queued: 'Staged for batch send · review on /queue',
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

      // Fire the post-rejection capture sheet (mounted at layout level) so the
      // user has a non-blocking nudge to record what they learned. Sheet itself
      // owns the 600ms delay so the success toast lands first.
      if (newStatus === 'Rejected' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('career-ops:post-rejection-prompt', {
            detail: { jobId: job.id, jobLabel },
          }),
        );
      }
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

  async function checkLiveness() {
    if (!job.id || livenessBusy) return;
    livenessBusy = true;
    try {
      const r = await withMinDuration(
        api.post<{ verdict: 'active' | 'expired' | 'uncertain'; reason?: string; closed: boolean }>(
          '/api/job/' + encodeURIComponent(job.id) + '/liveness',
          {},
          { silent: true },
        ),
        700,
      );
      if (r.verdict === 'active') {
        toast.success('Posting still live', {
          description: jobLabel + ' — go ahead and apply.',
        });
      } else if (r.verdict === 'expired') {
        toast.warning('Posting expired · marked Closed', {
          description: jobLabel + (r.reason ? ' — ' + r.reason : '') + '. Tracker updated automatically.',
          duration: 8_000,
        });
        await invalidateAll();
      } else {
        toast.info('Liveness uncertain', {
          description: jobLabel + (r.reason ? ' — ' + r.reason : '') + '. Flagged in the Inbox; verify by hand.',
          duration: 8_000,
        });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Liveness check failed', {
        description: jobLabel + ' — ' + err.message + '. Playwright must be installed in the venv.',
        action: { label: 'Retry', onClick: () => checkLiveness() },
        duration: 10_000,
      });
    } finally {
      livenessBusy = false;
    }
  }

  async function draftFollowup(tone: 'warm' | 'direct' | 'short' = 'warm') {
    if (!job.id || followupBusy) return;
    followupBusy = true;
    followupDraft = null;
    followupSheetOpen = true;
    try {
      const r = await api.post<{ ok: boolean; path: string; content: string; error?: string }>(
        '/api/job/' + encodeURIComponent(job.id) + '/followup-draft',
        { tone },
        { silent: true },
      );
      if (!r.ok) throw new Error(r.error ?? 'Draft generation failed');
      followupDraft = { path: r.path, content: r.content };
      toast.success('Follow-up drafted', {
        description: jobLabel + ' — opened in a sheet. Copy a variant and paste into LinkedIn / email.',
        duration: 6_000,
      });
    } catch (e) {
      followupSheetOpen = false;
      const err = e as ApiError;
      toast.error('Follow-up draft failed', {
        description: jobLabel + ' — ' + err.message + '. Claude Code CLI must be on PATH.',
        action: { label: 'Retry', onClick: () => draftFollowup(tone) },
        duration: 12_000,
      });
    } finally {
      followupBusy = false;
    }
  }

  async function copyDraft() {
    if (!followupDraft) return;
    try {
      await navigator.clipboard.writeText(followupDraft.content);
      toast.success('Draft copied to clipboard');
    } catch {
      toast.error('Copy failed', { description: 'Browser blocked clipboard access.' });
    }
  }

  async function openFormAnswers() {
    if (!job.id) return;
    formAnswersSheetOpen = true;
    if (formAnswersData || formAnswersBusy) return; // already loaded / loading
    // Try cached first; if missing, generate.
    formAnswersBusy = true;
    try {
      const cached = await api.get<{ cached: { path: string; body: string } | null }>(
        '/api/job/' + encodeURIComponent(job.id) + '/form-answers',
        { silent: true },
      );
      if (cached.cached) {
        formAnswersData = { path: cached.cached.path, content: cached.cached.body };
      } else {
        await regenerateFormAnswers();
      }
    } catch {
      // Fall through to generate path on any cache fetch error
      await regenerateFormAnswers();
    } finally {
      formAnswersBusy = false;
    }
  }

  async function regenerateFormAnswers() {
    if (!job.id) return;
    formAnswersBusy = true;
    try {
      const r = await api.post<{ ok: boolean; path?: string; body?: string; error?: string }>(
        '/api/job/' + encodeURIComponent(job.id) + '/form-answers',
        {},
        { silent: true },
      );
      if (!r.ok) throw new Error(r.error ?? 'Form-answers generation failed');
      formAnswersData = { path: r.path ?? '', content: r.body ?? '' };
      toast.success('Form answers ready', {
        description: jobLabel + ' — copy each answer into the matching field on the portal.',
        duration: 6_000,
      });
    } catch (e) {
      const err = e as ApiError;
      toast.error('Form answers failed', {
        description: jobLabel + ' — ' + err.message + '. Claude Code CLI must be on PATH.',
        action: { label: 'Retry', onClick: () => regenerateFormAnswers() },
        duration: 12_000,
      });
    } finally {
      formAnswersBusy = false;
    }
  }

  async function copyFormAnswers() {
    if (!formAnswersData) return;
    try {
      await navigator.clipboard.writeText(formAnswersData.content);
      toast.success('All answers copied');
    } catch {
      toast.error('Copy failed', { description: 'Browser blocked clipboard access.' });
    }
  }

  async function copyOneAnswer(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Answer copied');
    } catch {
      toast.error('Copy failed', { description: 'Browser blocked clipboard access.' });
    }
  }

  /** Split the markdown into per-question blocks for individual Copy buttons.
   *  The mode writes one `## N. {question}` heading per answer. */
  function parseAnswerBlocks(md: string): { heading: string; body: string }[] {
    const out: { heading: string; body: string }[] = [];
    const lines = md.split('\n');
    let cur: { heading: string; body: string } | null = null;
    for (const line of lines) {
      const m = /^##\s+(?:\d+\.\s+)?(.+)$/.exec(line.trim());
      if (m) {
        if (cur) out.push(cur);
        cur = { heading: m[1], body: '' };
      } else if (cur) {
        cur.body += line + '\n';
      }
    }
    if (cur) out.push(cur);
    return out
      .filter((b) => b.heading && !b.heading.startsWith('Form answers'))
      .map((b) => ({ heading: b.heading, body: b.body.trim() }));
  }

  let formAnswerBlocks = $derived(formAnswersData ? parseAnswerBlocks(formAnswersData.content) : []);

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

      <DropdownMenu.Item
        onSelect={checkLiveness}
        closeOnSelect={false}
        class="gap-2 items-start py-2"
        disabled={!job.url || livenessBusy}
      >
        {#if livenessBusy}
          <Loader2 class="size-3.5 mt-0.5 animate-spin flex-shrink-0" />
        {:else}
          <Activity class="size-3.5 mt-0.5 text-blue-400 flex-shrink-0" />
        {/if}
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium">Check still live</div>
          <div class="text-[10px] text-muted-foreground/70 leading-tight">
            Playwright probe of the URL. Auto-closes the row if the posting is gone.
          </div>
        </div>
      </DropdownMenu.Item>

      <DropdownMenu.Item
        onSelect={() => draftFollowup('warm')}
        closeOnSelect={false}
        class="gap-2 items-start py-2"
        disabled={!job.url || followupBusy}
      >
        {#if followupBusy}
          <Loader2 class="size-3.5 mt-0.5 animate-spin flex-shrink-0" />
        {:else}
          <Bell class="size-3.5 mt-0.5 text-amber-400 flex-shrink-0" />
        {/if}
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium">Draft follow-up</div>
          <div class="text-[10px] text-muted-foreground/70 leading-tight">
            Generates 2–3 message variants tuned to days-since-applied. Reuses contacts from your tracker.
          </div>
        </div>
      </DropdownMenu.Item>

      <DropdownMenu.Item
        onSelect={openFormAnswers}
        closeOnSelect={false}
        class="gap-2 items-start py-2"
        disabled={!job.url || formAnswersBusy}
      >
        {#if formAnswersBusy}
          <Loader2 class="size-3.5 mt-0.5 animate-spin flex-shrink-0" />
        {:else}
          <ClipboardCheck class="size-3.5 mt-0.5 text-fuchsia-400 flex-shrink-0" />
        {/if}
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium">Open answers</div>
          <div class="text-[10px] text-muted-foreground/70 leading-tight">
            Pre-fills "why this role / why this company / years of X / comp / availability" — copy each block into the portal.
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

<!--
  Follow-up draft sheet — opens when the user picks "Draft follow-up". Renders
  the persisted markdown (Claude usually returns 2–3 variants in one file) so
  the user can copy the right tone for the moment.
-->
<Sheet.Root bind:open={followupSheetOpen}>
  <Sheet.Content side="right" class="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
    <Sheet.Header class="px-5 pt-5 pb-3 border-b">
      <div class="flex items-start gap-3">
        <div class="size-9 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/40 flex items-center justify-center flex-shrink-0">
          <Bell class="size-4 text-amber-300" />
        </div>
        <div class="flex-1 min-w-0">
          <Sheet.Title class="text-base">Follow-up draft</Sheet.Title>
          <Sheet.Description class="text-xs mt-0.5">
            {jobLabel}
          </Sheet.Description>
        </div>
      </div>
    </Sheet.Header>

    <div class="flex items-center gap-2 px-5 py-3 border-b">
      <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Tone</span>
      <Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => draftFollowup('warm')} disabled={followupBusy}>Warm</Button>
      <Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => draftFollowup('direct')} disabled={followupBusy}>Direct</Button>
      <Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => draftFollowup('short')} disabled={followupBusy}>Short</Button>
      <div class="flex-1"></div>
      {#if followupDraft}
        <Button size="sm" class="h-7 text-xs gap-1.5" onclick={copyDraft}>
          <Copy class="size-3" /> Copy all
        </Button>
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto p-5">
      {#if followupBusy && !followupDraft}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 class="size-4 animate-spin" />
          Generating draft via Claude — usually 30–60s.
        </div>
      {:else if followupDraft}
        <article class="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-sans">{followupDraft.content}</article>
        <p class="mt-6 text-[10px] text-muted-foreground/60 font-mono">{followupDraft.path}</p>
      {/if}
    </div>
  </Sheet.Content>
</Sheet.Root>

<!--
  Form-answers sheet — pre-filled Q&A for non-LinkedIn portals (Greenhouse,
  Ashby, Lever). Each answer block has its own Copy button so the user pastes
  one-by-one into the matching field on the application form.
-->
<Sheet.Root bind:open={formAnswersSheetOpen}>
  <Sheet.Content side="right" class="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
    <Sheet.Header class="px-5 pt-5 pb-3 border-b">
      <div class="flex items-start gap-3">
        <div class="size-9 rounded-lg bg-fuchsia-500/10 ring-1 ring-fuchsia-500/40 flex items-center justify-center flex-shrink-0">
          <ClipboardCheck class="size-4 text-fuchsia-300" />
        </div>
        <div class="flex-1 min-w-0">
          <Sheet.Title class="text-base">Form answers</Sheet.Title>
          <Sheet.Description class="text-xs mt-0.5">
            {jobLabel}
          </Sheet.Description>
        </div>
      </div>
    </Sheet.Header>

    <div class="flex items-center gap-2 px-5 py-3 border-b">
      <span class="text-[10px] uppercase tracking-wider text-muted-foreground">{formAnswerBlocks.length} questions</span>
      <div class="flex-1"></div>
      <Button variant="outline" size="sm" class="h-7 text-xs gap-1.5" onclick={regenerateFormAnswers} disabled={formAnswersBusy}>
        {#if formAnswersBusy}
          <Loader2 class="size-3 animate-spin" /> Regenerating…
        {:else}
          <Wand2 class="size-3" /> Regenerate
        {/if}
      </Button>
      {#if formAnswersData}
        <Button size="sm" class="h-7 text-xs gap-1.5" onclick={copyFormAnswers}>
          <Copy class="size-3" /> Copy all
        </Button>
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto p-5 space-y-3">
      {#if formAnswersBusy && !formAnswersData}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 class="size-4 animate-spin" />
          Generating answers via Claude — usually 30–60s.
        </div>
      {:else if formAnswersData && formAnswerBlocks.length > 0}
        {#each formAnswerBlocks as block, i (i)}
          <div class="rounded-md border border-border/40 bg-card px-4 py-3 space-y-1.5">
            <div class="flex items-start justify-between gap-2">
              <h4 class="text-xs font-semibold text-foreground">{block.heading}</h4>
              <Button variant="ghost" size="sm" class="h-6 px-2 text-[10px] gap-1" onclick={() => copyOneAnswer(block.body)}>
                <Copy class="size-2.5" /> Copy
              </Button>
            </div>
            <p class="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{block.body}</p>
          </div>
        {/each}
        {#if formAnswersData.path}
          <p class="text-[10px] text-muted-foreground/60 font-mono pt-2">{formAnswersData.path}</p>
        {/if}
      {:else if formAnswersData}
        <article class="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-sans">{formAnswersData.content}</article>
      {/if}
    </div>
  </Sheet.Content>
</Sheet.Root>
