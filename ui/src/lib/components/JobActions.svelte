<!--
  JobActions — the SHARED per-job action menu used by every pipeline view
  (board card, list row, compact row, table row, by-company row) AND the
  job-detail page's hero. Single source of truth for:

    * Change status   (drives /api/status)
    * Apply           (linkedin / open-and-mark / mark -- drives /api/job/[id]/apply)
    * Generate CV     (drives /api/job/[id]/cv via runEvaluate)
    * Open posting    (target=_blank on the URL)
    * Copy URL        (clipboard)

  The component absorbs the network calls and toast notifications so callers
  never duplicate the apply/status/CV dance. After every successful mutation
  it fires SvelteKit's invalidateAll() so all visible views refresh.

  Visual variants:
    * size="row"    -- small icon-only triggers (used in dense rows: compact / list / table)
    * size="card"   -- slightly larger triggers with abbreviated labels (board / by-company)
    * size="hero"   -- full labelled buttons (job detail page)
-->
<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import ResponsiveActionMenu from './ResponsiveActionMenu.svelte';
  import ResponsiveActionItem from './ResponsiveActionItem.svelte';
  import ResponsiveActionLabel from './ResponsiveActionLabel.svelte';
  import ResponsiveActionSeparator from './ResponsiveActionSeparator.svelte';
  import {
    ChevronDown,
    MoreHorizontal,
    Send,
    Check,
    ClipboardCheck,
    ArrowUpRight,
    Sparkles,
    ExternalLink,
    Copy,
    FileBadge2,
    FileText,
    Network as Linkedin,
    Loader2,
    Wand2,
    Activity,
    Bell,
    Zap,
  } from '@lucide/svelte';
  import { api, ApiError } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { withMinDuration, cn } from '$lib/utils';
  import type { Job, Status } from '$lib/types';
  import { STATUS_ORDER } from '$lib/types';
  import { BRAND_STORAGE_PREFIX } from '$lib/client/brand';

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
  let isApplied = $derived(
    ['Applied', 'Screened', 'Interview', 'Offer', 'Rejected'].includes(job.status),
  );
  let isQueued = $derived(job.status === 'Queued');
  let isApplying = $derived(job.status === 'Applying');
  let needsManual = $derived(job.status === 'ManualApplyNeeded');
  let hasPdf = $derived(!!job.pdfFile);
  let hasReport = $derived(!!job.reportFile);
  // Pull the per-profile automation block surfaced by +layout.server.ts.
  // When the job's profile has autonomous_apply ON, we collapse the
  // 3-mode dropdown into a single "Queue apply" button -- clicking it
  // hands the job off to apply-queue-drain which runs the right portal
  // adapter automatically.
  type ProfileAutomation = {
    autonomous_apply?: boolean;
    min_score_to_apply?: number;
    enabled_portals?: string[];
  };
  let profileAutomations = $derived(
    (page.data?.profileAutomations as Record<string, ProfileAutomation> | undefined) ?? {},
  );
  let autonomousMode = $derived(
    !!(job.profileId && profileAutomations[job.profileId]?.autonomous_apply),
  );
  // Append `?profile=<slug>` to every per-job endpoint call so the server
  // resolves the right profile's interview-prep / output / reports dirs
  // and swaps repo-root symlinks before spawning Claude. Empty when the
  // job has no profileId (legacy pre-migration data); the endpoint's
  // resolveJobAndProfile fallback finds it cross-profile in that case.
  let pq = $derived(job.profileId ? '?profile=' + encodeURIComponent(job.profileId) : '');

  let applyBusy = $state<ApplyMode | null>(null);
  let queueApplyBusy = $state(false);
  let cvBusy = $state(false);
  let livenessBusy = $state(false);
  let followupBusy = $state(false);
  let followupDraft = $state<{ path: string; content: string } | null>(null);
  let followupSheetOpen = $state(false);
  let formAnswersBusy = $state(false);
  let techPrepBusy = $state(false);
  let formAnswersData = $state<{ path: string; content: string } | null>(null);
  let formAnswersSheetOpen = $state(false);
  let statusBusy = $state(false);

  const STATUS_DOTS: Record<Status, string> = {
    New: 'bg-zinc-400',
    Scoring: 'bg-blue-400',
    Scored: 'bg-cyan-400',
    Ready: 'bg-emerald-400',
    Queued: 'bg-fuchsia-400',
    Applying: 'bg-blue-400',
    Applied: 'bg-violet-400',
    Screened: 'bg-amber-400',
    // Interview sub-stages -- warm hue family, ordered light → dark by progression.
    PhoneScreen: 'bg-amber-300',
    Technical: 'bg-orange-400',
    TakeHome: 'bg-yellow-400',
    Onsite: 'bg-orange-500',
    Final: 'bg-red-400',
    Interview: 'bg-orange-400',
    Offer: 'bg-green-400',
    Negotiating: 'bg-lime-400',
    Accepted: 'bg-emerald-500',
    Declined: 'bg-zinc-400',
    Ghosted: 'bg-zinc-500',
    Rejected: 'bg-red-400',
    Closed: 'bg-zinc-500',
    ManualApplyNeeded: 'bg-amber-500',
  };
  const STATUS_HINT: Record<Status, string> = {
    New: 'Just discovered — no score yet',
    Scoring: 'Gemini is processing this job',
    Scored: 'Has a Gemini score · review and promote',
    Ready: 'Eval done · CV PDF ready · go apply',
    Queued: 'Staged for batch send · review on /queue',
    Applying: 'Autonomous-apply script running right now',
    Applied: 'Application sent',
    Screened: 'Recruiter responded',
    PhoneScreen: 'Recruiter / hiring-manager phone screen scheduled or in progress',
    Technical: 'Technical interview · algorithms / system design / live coding',
    TakeHome: 'Take-home coding assignment in progress',
    Onsite: 'Onsite / panel loop · multiple rounds in one day',
    Final: 'Final round · hiring committee / VP / exec',
    Interview: 'Active interview process (use sub-stages to track which round)',
    Offer: 'Offer in hand · negotiate',
    Negotiating: 'Counter-offer round(s) in progress',
    Accepted: 'You accepted the offer',
    Declined: 'You declined the offer',
    Ghosted: 'No response for ≥21 days — auto-flagged silent',
    Rejected: 'Closed by company',
    Closed: 'You skipped this one',
    ManualApplyNeeded: 'Auto-apply blocked — finish the form by hand from Inbox',
  };

  // ---------- actions ----------
  // Compose a "<Company> · <Role>" subtitle that's used as the description on
  // every toast so the user always knows which job a notification is about.
  let jobLabel = $derived(
    job.company && job.role ? job.company + ' · ' + job.role : job.company || job.role || 'Job',
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
          new CustomEvent(`${BRAND_STORAGE_PREFIX}:post-rejection-prompt`, {
            // Pass profileId so the sheet's POST appends to the right profile's
            // story bank (story-bank.md itself is shared, but the spawned
            // claude-cli reads the matching profile's CV + report).
            detail: { jobId: job.id, jobLabel, profileId: job.profileId },
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

  /**
   * Stage the job for apply-queue-drain. Used when the job's profile has
   * autonomous_apply ON -- collapses the 3-mode dropdown into a single
   * click that hands off to the autopilot drain. Returns immediately;
   * progress flows through APPLY_STEP events to the activity bell.
   */
  async function queueApply() {
    if (!job.id || queueApplyBusy) return;
    queueApplyBusy = true;
    try {
      const r = await withMinDuration(
        api.post<{
          ok: boolean;
          status?: string;
          already?: string;
          capped?: boolean;
          portal?: string;
          message: string;
        }>('/api/job/' + encodeURIComponent(job.id) + '/queue-apply' + pq, {}, { silent: true }),
        300,
      );
      if (r.ok) {
        toast.success('Queued · ' + (r.portal ?? 'auto'), {
          description: jobLabel + ' — ' + r.message,
          duration: 8_000,
        });
        await invalidateAll();
      } else if (r.capped) {
        toast.warning('Daily apply cap reached', {
          description: r.message + ' (raise it on /autopilot).',
          duration: 10_000,
        });
      } else if (r.already) {
        toast.info('Already ' + r.already, {
          description: jobLabel + ' — ' + r.message,
        });
      } else {
        toast.error('Queue refused', { description: r.message });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Queue apply failed', {
        description: jobLabel + ' — ' + err.message,
        action: { label: 'Retry', onClick: () => queueApply() },
        duration: 12_000,
      });
    } finally {
      queueApplyBusy = false;
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
          '/api/job/' + encodeURIComponent(job.id) + '/apply' + pq,
          { mode },
          { silent: true },
        ),
        500,
      );
      if (r.ok) {
        if (mode === 'linkedin') {
          toast.success('LinkedIn Easy Apply started', {
            description:
              jobLabel +
              ' — watch the bell (top-right) for per-step events. A success/failure toast will pop on completion.',
            duration: 8_000,
          });
        } else if (mode === 'open-and-mark') {
          toast.success('Opened posting · marked Applied', {
            description:
              jobLabel + ' — finish the form in the new tab; the tracker is already updated.',
            duration: 8_000,
          });
        } else {
          toast.success('Marked as Applied', {
            description:
              jobLabel +
              ' — moved to /applied. Use the status dropdown to escalate to Screened/Interview.',
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
          '/api/job/' + encodeURIComponent(job.id) + '/cv' + pq,
          {},
          { silent: true },
        ),
        500,
      );
      if (r.ok) {
        toast.success('Generating tailored CV', {
          description:
            jobLabel +
            ' — ~1–3 min. Watch the bell for "Generate CV finished" or "Generate CV failed".',
          duration: 8_000,
        });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('CV generation failed', {
        description:
          jobLabel + ' — ' + err.message + '. Claude Code CLI must be on PATH for this to work.',
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
          '/api/job/' + encodeURIComponent(job.id) + '/liveness' + pq,
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
          description:
            jobLabel + (r.reason ? ' — ' + r.reason : '') + '. Tracker updated automatically.',
          duration: 8_000,
        });
        await invalidateAll();
      } else {
        toast.info('Liveness uncertain', {
          description:
            jobLabel +
            (r.reason ? ' — ' + r.reason : '') +
            '. Flagged in the Inbox; verify by hand.',
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
        '/api/job/' + encodeURIComponent(job.id) + '/followup-draft' + pq,
        { tone },
        { silent: true },
      );
      if (!r.ok) throw new Error(r.error ?? 'Draft generation failed');
      followupDraft = { path: r.path, content: r.content };
      toast.success('Follow-up drafted', {
        description:
          jobLabel + ' — opened in a sheet. Copy a variant and paste into LinkedIn / email.',
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

  /**
   * Generate a technical-interview prep plan for this job. Spawns the
   * tech-prep Claude mode in the background; the user gets a toast +
   * activity-feed events. The file lands at
   *   interview-prep/{company-slug}-{role-slug}-tech-prep.md
   * with budgeted hours, specific LeetCode problems, and the architectural
   * debates this company cares about.
   */
  async function generateTechPrep() {
    if (!job.id || techPrepBusy) return;
    techPrepBusy = true;
    try {
      const r = await withMinDuration(
        api.post<{
          ok: boolean;
          path?: string;
          meta?: { rounds?: number; hoursEstimated?: number; sourcesCited?: number };
          error?: string;
        }>('/api/job/' + encodeURIComponent(job.id) + '/tech-prep' + pq, {}, { silent: true }),
        500,
      );
      if (r.ok) {
        toast.success('Tech prep generated', {
          description:
            jobLabel +
            ' — ' +
            (r.meta?.rounds ? r.meta.rounds + ' rounds · ' : '') +
            (r.meta?.hoursEstimated ? '~' + r.meta.hoursEstimated + 'h prep · ' : '') +
            (r.path ?? ''),
          duration: 8_000,
        });
      } else {
        toast.error('Tech prep failed', { description: jobLabel + ' — ' + (r.error ?? 'unknown') });
      }
    } catch (e) {
      const err = e as ApiError;
      toast.error('Tech prep failed', {
        description: jobLabel + ' — ' + err.message,
        action: { label: 'Retry', onClick: () => generateTechPrep() },
        duration: 12_000,
      });
    } finally {
      techPrepBusy = false;
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
        '/api/job/' + encodeURIComponent(job.id) + '/form-answers' + pq,
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
        '/api/job/' + encodeURIComponent(job.id) + '/form-answers' + pq,
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

  let formAnswerBlocks = $derived(
    formAnswersData ? parseAnswerBlocks(formAnswersData.content) : [],
  );

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
  function stopBubble(e: MouseEvent) {
    e.stopPropagation();
  }
</script>

<!--
  Three pieces side-by-side: Apply (primary CTA) · Status · ⋯ More.
-->
<div
  class={cn('flex items-center gap-1 flex-shrink-0', size === 'hero' && 'gap-2')}
  onclick={stopBubble}
  role="presentation"
>
  <!-- ============ APPLY MENU ============ -->
  <!--
    Two shapes, switched by profile.automation.autonomous_apply:

      autonomousMode ON  → single "Queue apply" button (POST /queue-apply)
      autonomousMode OFF → 3-mode ResponsiveActionMenu (LinkedIn / Open & Mark / Mark)

    The autonomous shape still uses bits-ui Tooltip directly because it's
    a single-action button (no menu); the multi-mode shape uses
    ResponsiveActionMenu which renders as a bottom-sheet on mobile and
    a dropdown-with-tooltip on desktop in one component.
  -->
  {#if autonomousMode && !isApplied}
    <!-- ───── Autonomous: single Queue Apply button ───── -->
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props: tipProps })}
            {#if size === 'hero'}
              <Button
                {...tipProps}
                onclick={queueApply}
                variant={isQueued || isApplying ? 'outline' : 'default'}
                size="sm"
                class={cn(
                  'h-9 gap-1.5',
                  isQueued && 'border-fuchsia-500/40 text-fuchsia-200',
                  isApplying && 'border-blue-500/40 text-blue-200',
                  needsManual && 'border-amber-500/40 text-amber-200',
                )}
                disabled={queueApplyBusy || isQueued || isApplying}
              >
                {#if queueApplyBusy}
                  <Loader2 class="size-3.5 animate-spin" />
                  <span>Queuing…</span>
                {:else if isQueued}
                  <ClipboardCheck class="size-3.5" />
                  <span>Queued</span>
                {:else if isApplying}
                  <Loader2 class="size-3.5 animate-spin" />
                  <span>Applying…</span>
                {:else if needsManual}
                  <Bell class="size-3.5" />
                  <span>Needs review</span>
                {:else}
                  <Zap class="size-3.5" />
                  <span>Apply</span>
                {/if}
              </Button>
            {:else}
              <Button
                {...tipProps}
                onclick={queueApply}
                variant="ghost"
                size="icon"
                class={cn(
                  size === 'card' ? 'size-7' : 'size-7',
                  isQueued && 'text-fuchsia-300',
                  isApplying && 'text-blue-300',
                  needsManual && 'text-amber-300',
                )}
                disabled={queueApplyBusy || isQueued || isApplying}
                aria-label="Queue apply"
              >
                {#if queueApplyBusy || isApplying}
                  <Loader2 class="size-3.5 animate-spin" />
                {:else if isQueued}
                  <ClipboardCheck class="size-3.5" />
                {:else if needsManual}
                  <Bell class="size-3.5" />
                {:else}
                  <Zap class="size-3.5" />
                {/if}
              </Button>
            {/if}
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top" class="text-xs max-w-xs">
          {#if isQueued}
            Queued for autonomous apply — apply-queue-drain will pick it up at its next run, or run
            it manually from /agents.
          {:else if isApplying}
            Apply script is running right now — watch the bell for step events.
          {:else if needsManual}
            Auto-apply hit a soft block (CAPTCHA, unknown field, anti-bot). Open Inbox to finish by
            hand.
          {:else}
            Stage for autopilot apply — cover letter + tailored CV will be generated, then the right
            portal adapter runs against your saved session.
          {/if}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  {:else}
    <ResponsiveActionMenu
      title="Apply to this job"
      description={isLinkedIn
        ? 'LinkedIn Easy Apply (auto), open the posting and mark applied, or status-flip only.'
        : 'Open the posting and mark applied, or status-flip only.'}
      align={align as 'start' | 'end' | 'center'}
      desktopWidth="w-72"
    >
      {#snippet trigger({ props })}
        {#if size === 'hero'}
          <Button
            {...props}
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
            {...props}
            variant="ghost"
            size="icon"
            class={cn(size === 'card' ? 'size-7' : 'size-7', isApplied && 'text-emerald-400')}
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
      {#snippet tooltip()}
        {#if isApplied}
          Already marked Applied — open menu to apply again or change status.
        {:else if isLinkedIn}
          Apply via LinkedIn Easy Apply (auto), or open posting and mark applied.
        {:else}
          Open the posting in a new tab and mark applied.
        {/if}
      {/snippet}
      {#snippet items()}
        {#if isLinkedIn}
          <ResponsiveActionItem
            onSelect={() => apply('linkedin')}
            closeOnSelect={false}
            icon={Linkedin}
            description="Playwright fills + (optionally) submits. Watch the bell for progress."
          >
            LinkedIn Easy Apply
            {#snippet trailing()}
              {#if applyBusy === 'linkedin'}<Loader2 class="size-3 animate-spin" />{/if}
            {/snippet}
          </ResponsiveActionItem>

          <!-- Why we don't tailor the resume for LinkedIn — recruiters see your
             LinkedIn profile and the uploaded resume side-by-side. A tailored
             CV that diverges from the profile is a known red flag, so this
             path uses the General CV PDF (cv-general.pdf) which is generated
             straight from cv.md with no per-job rewriting. -->
          <div
            class="px-2 py-1.5 text-[11px] text-muted-foreground/80 leading-tight border-l-2 border-blue-500/40 ml-2 mr-2 my-1 bg-blue-500/5 rounded-sm"
          >
            <div class="font-medium text-blue-200/90 mb-0.5">
              Uploads your General CV (not the per-job tailored one)
            </div>
            <p class="text-muted-foreground/80">
              Recruiters see your LinkedIn profile + resume side by side. A tailored CV that
              diverges from your profile is a recruiter red flag, so this path uses the untailored <code
                class="font-mono">cv-general.pdf</code
              >
              built from
              <code class="font-mono">cv.md</code>. Tailored CVs are still used for non-LinkedIn
              portals.
              <a
                href="/profile#companion-files"
                class="underline underline-offset-2 hover:text-foreground">Manage general CV →</a
              >
            </p>
          </div>
        {:else}
          <div
            class="px-2 py-1.5 text-[11px] text-muted-foreground/70 leading-tight border-l-2 border-amber-500/40 ml-2 mr-2 my-1 bg-amber-500/5 rounded-sm py-1.5 px-2"
          >
            Not a LinkedIn URL — Easy Apply automation isn't available. Use Open &amp; Mark Applied
            to walk through the posting yourself.
          </div>
        {/if}

        <ResponsiveActionItem
          onSelect={() => apply('open-and-mark')}
          closeOnSelect={false}
          disabled={!job.url}
          icon={ArrowUpRight}
          description="Opens the URL in a new tab and flips status. You finish the form by hand."
        >
          Open posting &amp; mark Applied
          {#snippet trailing()}
            {#if applyBusy === 'open-and-mark'}<Loader2 class="size-3 animate-spin" />{/if}
          {/snippet}
        </ResponsiveActionItem>

        <ResponsiveActionItem
          onSelect={() => apply('mark')}
          closeOnSelect={false}
          icon={ClipboardCheck}
          description="Status flip only — use when you applied elsewhere or want to skip."
        >
          Mark Applied (no open)
          {#snippet trailing()}
            {#if applyBusy === 'mark'}<Loader2 class="size-3 animate-spin" />{/if}
          {/snippet}
        </ResponsiveActionItem>

        <ResponsiveActionSeparator />
        <div class="px-3 py-1.5 text-[11px] text-muted-foreground/60 leading-tight">
          Notifications: success/failure toasts pop here, the bell logs every event, and failed jobs
          surface a Retry button on the toast.
        </div>
      {/snippet}
    </ResponsiveActionMenu>
  {/if}

  <!-- ============ STATUS DROPDOWN ============ -->
  <ResponsiveActionMenu
    title="Change status"
    description="Move this job to a different pipeline stage."
    align={align as 'start' | 'end' | 'center'}
    desktopWidth="w-64 max-h-72 overflow-y-auto"
  >
    {#snippet trigger({ props })}
      {#if size === 'hero'}
        <Button {...props} variant="outline" size="sm" class="h-9 gap-1.5">
          <span class={cn('size-1.5 rounded-full', STATUS_DOTS[job.status])}></span>
          <span class="text-xs">{job.status}</span>
          <ChevronDown class="size-3 opacity-60" />
        </Button>
      {:else}
        <Button {...props} variant="ghost" size="icon" class="size-7" aria-label="Change status">
          <span class={cn('size-2 rounded-full', STATUS_DOTS[job.status])}></span>
        </Button>
      {/if}
    {/snippet}
    {#snippet tooltip()}
      <div class="font-medium">Status: {job.status}</div>
      <div class="text-muted-foreground">{STATUS_HINT[job.status]}</div>
      <div class="text-muted-foreground/70 mt-1 text-[11px]">Click to change</div>
    {/snippet}
    {#snippet items()}
      <ResponsiveActionLabel>Change status</ResponsiveActionLabel>
      {#each STATUS_ORDER as s}
        <ResponsiveActionItem
          onSelect={() => changeStatus(s)}
          closeOnSelect={false}
          active={s === job.status}
          description={STATUS_HINT[s]}
        >
          {#snippet leading()}
            <span class={cn('size-2 rounded-full flex-shrink-0', STATUS_DOTS[s])}></span>
          {/snippet}
          {s}
        </ResponsiveActionItem>
      {/each}
    {/snippet}
  </ResponsiveActionMenu>

  <!-- ============ MORE / OVERFLOW ============ -->
  <ResponsiveActionMenu
    title="More actions"
    description="Tailored CV, follow-up drafts, tech-prep, mock interview, links."
    align={align as 'start' | 'end' | 'center'}
    desktopWidth="w-72"
  >
    {#snippet trigger({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon"
        class={cn(size === 'hero' ? 'size-9' : 'size-7')}
        aria-label="More actions"
      >
        <MoreHorizontal class="size-3.5" />
      </Button>
    {/snippet}
    {#snippet tooltip()}More actions{/snippet}
    {#snippet items()}
      <ResponsiveActionLabel>Tools</ResponsiveActionLabel>

      <ResponsiveActionItem
        onSelect={generateCv}
        closeOnSelect={false}
        disabled={!job.url || cvBusy}
        icon={cvBusy ? Loader2 : Wand2}
        description="Spawns Claude evaluate — produces a deep eval report + CV PDF. 1–3 min per job."
      >
        {hasPdf ? 'Regenerate tailored CV' : 'Generate tailored CV'}
      </ResponsiveActionItem>

      <ResponsiveActionItem
        onSelect={checkLiveness}
        closeOnSelect={false}
        disabled={!job.url || livenessBusy}
        icon={livenessBusy ? Loader2 : Activity}
        description={'Loads the URL with Playwright and looks for "expired" / "no longer accepting" markers. If the posting is gone, the row flips to Closed automatically.'}
      >
        Check if still open
      </ResponsiveActionItem>

      <ResponsiveActionItem
        onSelect={() => draftFollowup('warm')}
        closeOnSelect={false}
        disabled={!job.url || followupBusy}
        icon={followupBusy ? Loader2 : Bell}
        description="Spawns Claude to draft 2–3 message variants based on how long it's been since you applied. Picks tone (warm / direct / short) and references the contacts from your tracker."
      >
        Draft follow-up message
      </ResponsiveActionItem>

      <ResponsiveActionItem
        onSelect={openFormAnswers}
        closeOnSelect={false}
        disabled={!job.url || formAnswersBusy}
        icon={formAnswersBusy ? Loader2 : ClipboardCheck}
        description={'Drafts answers to the standard application-form questions ("why this role", "years of X", "salary expectations", "when can you start") so you can copy each one into a Greenhouse / Ashby / Lever portal instead of typing from scratch.'}
      >
        Pre-fill application answers
      </ResponsiveActionItem>

      <!-- Tech-prep — produces a focused technical-interview prep plan
           with budgeted hours, specific LeetCode problems, system-design
           topics, and behavioral story mapping. Useful once a job hits
           any interview stage (PhoneScreen / Technical / Onsite / Final). -->
      <ResponsiveActionItem
        onSelect={generateTechPrep}
        closeOnSelect={false}
        disabled={!job.url || techPrepBusy}
        icon={techPrepBusy ? Loader2 : Sparkles}
        description="Per-company technical-interview prep: pipeline map, coding rounds with specific LeetCode problems, system-design topics (this company's actual debates), behavioral story mapping. ~1-2 min via Claude."
      >
        Generate tech-prep plan
      </ResponsiveActionItem>

      <!-- Mock interview — voice-driven drill. Browser STT + TTS.
           Per-stage prompts (recruiter / technical / onsite / final);
           each turn scored 1-5 with feedback; transcript saved on end. -->
      <ResponsiveActionItem
        onSelect={() => location.assign('/job/' + job.id + '/mock' + pq)}
        disabled={!job.url}
        icon={FileBadge2}
        description="Voice drill — Claude speaks the questions, listens to your spoken answer, scores each turn 1-5 with one-sentence feedback. Per-stage (recruiter / technical / onsite / final). Saves a transcript + session summary you can refine before the real interview."
      >
        Mock interview (voice)
      </ResponsiveActionItem>

      <ResponsiveActionSeparator />
      <ResponsiveActionLabel>Open</ResponsiveActionLabel>

      {#if job.url}
        <ResponsiveActionItem
          onSelect={() => window.open(job.url, '_blank', 'noopener')}
          icon={ExternalLink}
          description={job.url}
        >
          Open posting
        </ResponsiveActionItem>
      {/if}

      {#if hasReport}
        <ResponsiveActionItem
          onSelect={() => location.assign('/job/' + job.id + '#report')}
          icon={FileText}
          description="7-block A–G report"
        >
          View deep evaluation
        </ResponsiveActionItem>
      {/if}

      {#if hasPdf}
        <ResponsiveActionItem
          onSelect={() => window.open('/api/job/' + job.id + '/pdf' + pq, '_blank', 'noopener')}
          icon={FileBadge2}
          description={job.pdfFile}
        >
          Open tailored CV PDF
        </ResponsiveActionItem>
      {/if}

      <ResponsiveActionSeparator />

      <ResponsiveActionItem
        onSelect={copyUrl}
        closeOnSelect={false}
        disabled={!job.url}
        icon={Copy}
      >
        Copy URL
      </ResponsiveActionItem>
    {/snippet}
  </ResponsiveActionMenu>
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
        <div
          class="size-9 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/40 flex items-center justify-center flex-shrink-0"
        >
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
      <span class="text-[11px] uppercase tracking-wider text-muted-foreground">Tone</span>
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-xs"
        onclick={() => draftFollowup('warm')}
        disabled={followupBusy}>Warm</Button
      >
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-xs"
        onclick={() => draftFollowup('direct')}
        disabled={followupBusy}>Direct</Button
      >
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-xs"
        onclick={() => draftFollowup('short')}
        disabled={followupBusy}>Short</Button
      >
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
        <article class="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-sans">
          {followupDraft.content}
        </article>
        <p class="mt-6 text-[11px] text-muted-foreground/60 font-mono">{followupDraft.path}</p>
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
        <div
          class="size-9 rounded-lg bg-fuchsia-500/10 ring-1 ring-fuchsia-500/40 flex items-center justify-center flex-shrink-0"
        >
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
      <span class="text-[11px] uppercase tracking-wider text-muted-foreground"
        >{formAnswerBlocks.length} questions</span
      >
      <div class="flex-1"></div>
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-xs gap-1.5"
        onclick={regenerateFormAnswers}
        disabled={formAnswersBusy}
      >
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
              <Button
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-[11px] gap-1"
                onclick={() => copyOneAnswer(block.body)}
              >
                <Copy class="size-2.5" /> Copy
              </Button>
            </div>
            <p class="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {block.body}
            </p>
          </div>
        {/each}
        {#if formAnswersData.path}
          <p class="text-[11px] text-muted-foreground/60 font-mono pt-2">{formAnswersData.path}</p>
        {/if}
      {:else if formAnswersData}
        <article class="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-sans">
          {formAnswersData.content}
        </article>
      {/if}
    </div>
  </Sheet.Content>
</Sheet.Root>
